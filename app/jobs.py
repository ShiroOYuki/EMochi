"""Gen 流程的狀態機（每個畫風一個專案，狀態存在 outputs/<style>/project.json）

draft ──(預覽)──> previewing ──> preview_ready ──(確認風格＋選貼圖)──> generating
  ^  \\__(擴寫中 expanding)                        |                          |
  |                                               └──(改描述再預覽)            v
  └────────────────────────────────────────────────────────────────────── review
                                                     (重生某組 / 全部確認) ──> processing ──> done
"""
import json
import shutil
import threading
import time
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from . import characters, codex, pipeline, prompts, settings, style_lib, usage
from .images import move_to_removed, save_png
from .paths import OUTPUTS, ROOT, codex_path, next_style_id, read_json, sticker_map, write_json

BUSY = {"expanding", "previewing", "generating", "processing"}
EDITABLE = {"draft", "preview_ready", "error"}

_locks: dict[str, threading.Lock] = {}
_pool = ThreadPoolExecutor(max_workers=8)   # 生圖組數另外由 _gen_slot() 限制；多出來的給擴寫、後處理

# 同時生圖組數：設定頁的 max_parallel，改了立即生效（等待中的組每 2 秒重看一次上限）
_slots = threading.Condition()
_running_gen = 0


@contextmanager
def _gen_slot():
    global _running_gen
    with _slots:
        while _running_gen >= max(1, int(settings.get("max_parallel"))):
            _slots.wait(timeout=2)
        _running_gen += 1
    try:
        yield
    finally:
        with _slots:
            _running_gen -= 1
            _slots.notify_all()


def _lock(style: str) -> threading.Lock:
    return _locks.setdefault(style, threading.Lock())


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def project_path(style: str) -> Path:
    return OUTPUTS / style / "project.json"


def load(style: str) -> dict | None:
    return read_json(project_path(style))


def save(p: dict) -> dict:
    p["updated"] = now()
    write_json(project_path(p["id"]), p)
    return p


def mutate(style: str, fn) -> dict:
    """在鎖內讀 → 改 → 存，避免背景執行緒互相覆蓋"""
    with _lock(style):
        p = load(style)
        if p is None:
            raise KeyError(style)
        fn(p)
        return save(p)


def list_projects() -> list[dict]:
    out = []
    for f in sorted(OUTPUTS.glob("*/project.json")):
        p = read_json(f)
        if p:
            item = {k: p.get(k) for k in ("id", "name", "status", "updated", "request")}
            item["character_id"] = refs_of(p).get("character_id")
            out.append(item)
    return sorted(out, key=lambda x: x.get("updated") or "", reverse=True)


def delete(style: str) -> None:
    """刪除專案：移到垃圾桶 outputs/_removed/（見 trash.py）。已完成的專案，貼圖也會一起從 Gallery 消失。執行中不能刪"""
    from . import trash
    with _lock(style):
        p = load(style)
        if not p:
            raise KeyError(style)
        if p.get("status") in BUSY:
            raise ValueError("專案正在執行中，等它結束再刪除")
        trash.move_to_trash("projects", style)


def recover_interrupted() -> None:
    """伺服器重啟時，把還停在「執行中」的專案標記為中斷"""
    for f in OUTPUTS.glob("*/project.json"):
        p = read_json(f)
        if not p or p.get("status") not in BUSY:
            continue
        for g in p.get("groups", []):
            if g.get("status") == "running":
                g.update(status="failed", message="伺服器重啟，執行被中斷")
        if p.get("preview", {}).get("status") == "running":
            p["preview"].update(status="failed", message="伺服器重啟，執行被中斷")
        p["status"] = "review" if p.get("groups") else "draft"
        p["error"] = "上次執行被中斷，請重新操作"
        save(p)


def rel(path: Path) -> str:
    """存進 project.json、交給 Codex 的路徑：資料根目錄底下用相對路徑，否則絕對路徑"""
    return codex_path(path)


def backup(path: Path) -> None:
    if path.exists():
        prev = path.parent / "_prev"
        prev.mkdir(exist_ok=True)
        stamp = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y%m%d_%H%M%S")
        shutil.copy2(path, prev / f"{path.stem}_{stamp}{path.suffix}")


# ---------- 1. 建立專案＋用 Codex 擴寫需求 ----------

def create(request: str, character_id: str | None = None, character_images: list[str] | None = None,
           temp: list[tuple[str, bytes, str]] | None = None, style_lib_id: str | None = None) -> dict:
    """temp = [(檔名, 圖片 bytes, role)]，role 是 "character" 或 "style"

    style_lib_id：直接套用畫風庫的畫風 → 不擴寫，描述照抄、勾選的範例圖當畫風參考圖，直接進入 draft"""
    if character_id and not characters.get(character_id):
        raise KeyError(f"角色 {character_id}")
    lib = style_lib.get(style_lib_id) if style_lib_id else None
    if style_lib_id and not lib:
        raise KeyError(f"畫風庫 {style_lib_id}")
    if lib and not lib.get("style_block", "").strip():
        raise ValueError("這個畫風還沒有描述，請先到「畫風」分頁讓 Codex 分析")
    if not lib and not request.strip() and not any(_role(r) == "style" for _, _, r in temp or []):
        raise ValueError("請描述想要的畫風，或上傳畫風參考圖")
    style = next_style_id()
    p = {"id": style, "name": "", "request": request.strip(), "style_block": "", "framing": "closeup",
         "process": {"square": 0.5, "margin": 0, "min_blob": 0.0003}, "notes_zh": "",
         "refs": {"character_id": character_id, "character_images": character_images, "temp": []},
         "status": "expanding", "error": None, "created": now(),
         "preview": None, "sticker_ids": [], "groups": []}
    if lib:
        p.update(name=lib["name"], request=lib.get("request", ""), style_block=lib["style_block"],
                 framing=lib["framing"], notes_zh=lib.get("notes_zh", ""), status="draft", style_lib_id=lib["id"])
        p["process"].update(square=lib["process"].get("square"), margin=lib["process"].get("margin", 0))
        # 檔名加上畫風庫 id（st1_ref_01.png），在專案參考圖裡和角色圖分得出來
        temp = [*((f"{lib['id']}_{Path(r).name}", (ROOT / r).read_bytes(), "style") for r in style_lib.rel_paths(lib["id"])),
                *(temp or [])]
    for name, raw, role in temp or []:
        p["refs"]["temp"].append({"file": save_png(raw, temp_dir(style), name), "role": _role(role)})
    with _lock(style):
        save(p)
    if not lib:
        _pool.submit(_expand, style)
    return p


def reexpand(style: str, request: str) -> dict:
    def fn(p):
        if p["status"] not in EDITABLE:
            raise ValueError(f"目前狀態 {p['status']} 不能重新擴寫")
        p.update(request=request.strip(), status="expanding", error=None)
    p = mutate(style, fn)
    _pool.submit(_expand, style)
    return p


EXAMPLE_PROJECTS = ("s5", "s4")   # 擴寫時給 Codex 看的範例畫風（寫得最完整的兩套）


def style_examples(n: int = 2) -> list[str]:
    """拿既有畫風的描述當範例，讓 Codex 寫出同樣格式：先用 s5、s4，沒有的話用畫風庫裡的"""
    ex = [b for s in EXAMPLE_PROJECTS if (b := ((load(s) or {}).get("style_block") or "").strip())]
    for lib in style_lib.list_all():
        if len(ex) >= n:
            break
        if (b := (lib.get("style_block") or "").strip()) and b not in ex:
            ex.append(b)
    return ex[:n]


def _expand(style: str) -> None:
    try:
        p = load(style)
        schema = codex.logs_dir() / style / "expand_schema.json"
        schema.parent.mkdir(parents=True, exist_ok=True)
        prompts.write_schema(schema)
        style_refs = ref_paths(p)["style"]
        answer = codex.run_text(prompts.expand_request_prompt(p["request"], style_examples(), style_refs),
                                schema, codex.log_path_for(style, "expand"), images=style_refs)
        data = json.loads(answer)

        def fn(p):
            p.update(name=data["name"], style_block=data["style_block"], framing=data["framing"],
                     notes_zh=data.get("notes_zh", ""), status="draft", error=None)
            p["process"].update(square=data.get("square"), margin=data.get("margin", 0))
        mutate(style, fn)
    except Exception as e:  # noqa: BLE001
        mutate(style, lambda p: p.update(status="draft", error=f"擴寫失敗：{e}"))


def update(style: str, fields: dict) -> dict:
    allowed = {"name", "style_block", "framing", "request"}

    def fn(p):
        if p["status"] not in EDITABLE:
            raise ValueError(f"目前狀態 {p['status']} 不能修改")
        for k in allowed & fields.keys():
            p[k] = fields[k]
        if "process" in fields:
            p["process"].update({k: v for k, v in fields["process"].items()
                                 if k in ("square", "margin", "min_blob")})
        if "character_id" in fields or "character_images" in fields:
            r = refs_of(p)
            if "character_id" in fields:
                cid = fields["character_id"] or None
                if cid and not characters.get(cid):
                    raise KeyError(f"角色 {cid}")
                if cid != r.get("character_id"):
                    r["character_images"] = None   # 換角色 → 先用該角色的預設圖
                r["character_id"] = cid
            if "character_images" in fields:
                r["character_images"] = fields["character_images"]
            p["refs"] = r
    return mutate(style, fn)


# ---------- 參考圖（角色庫＋這個畫風專用的暫時參考圖） ----------

def _role(role: str) -> str:
    return "style" if role == "style" else "character"


def temp_dir(style: str) -> Path:
    return OUTPUTS / style / "refs"


def refs_of(p: dict) -> dict:
    r = p.get("refs") or {}
    return {"character_id": r.get("character_id"), "character_images": r.get("character_images"),
            "temp": list(r.get("temp", []))}


def view(p: dict) -> dict:
    """給前端的專案資料：補上整理過的參考圖資訊。所有回傳專案的 API 都要經過這裡，
    否則前端拿到的欄位會時有時無（之前白畫面就是這樣來的）"""
    out = {**p, "refs": refs_of(p), "ref_paths": ref_paths(p)}
    if p.get("preview"):
        out["preview"] = _with_tokens(p["preview"])
    out["groups"] = [_with_tokens(g) for g in p.get("groups") or []]
    return out


def _with_tokens(item: dict) -> dict:
    """從這張圖的 Codex 紀錄讀出花了多少 token（重生後 log 會換成新的那次）"""
    log = item.get("log")
    return {**item, "tokens": usage.tokens_from_log(ROOT / log) if log else None}


def ref_paths(p: dict) -> dict:
    """{"character": [...], "style": [...], "identity": str|None}，路徑相對於專案根目錄（Codex 的 cwd）"""
    r = refs_of(p)
    char, identity, ears = [], "", True   # 角色特徵句只來自角色庫；沒選角色就靠附圖，不塞原角色的特徵
    if r["character_id"]:
        char = characters.rel_paths(r["character_id"], r["character_images"])
        c = characters.get(r["character_id"]) or {}
        identity, ears = c.get("identity", ""), characters.has_ears(c)
    tmp = {"character": [], "style": []}
    for t in r["temp"]:
        if (temp_dir(p["id"]) / t["file"]).exists():
            tmp[_role(t["role"])].append(rel(temp_dir(p["id"]) / t["file"]))
    return {"character": char + tmp["character"], "style": tmp["style"], "identity": identity, "ears": ears}


def add_temp_refs(style: str, files: list[tuple[str, bytes, str]]) -> dict:
    def fn(p):
        if p["status"] not in EDITABLE:
            raise ValueError(f"目前狀態 {p['status']} 不能改參考圖")
        r = refs_of(p)
        for name, raw, role in files:
            r["temp"].append({"file": save_png(raw, temp_dir(style), name), "role": _role(role)})
        p["refs"] = r
    return mutate(style, fn)


def update_temp_ref(style: str, file: str, role: str | None = None, remove: bool = False) -> dict:
    def fn(p):
        if p["status"] not in EDITABLE:
            raise ValueError(f"目前狀態 {p['status']} 不能改參考圖")
        r = refs_of(p)
        if remove:
            move_to_removed(temp_dir(style) / Path(file).name)
            r["temp"] = [t for t in r["temp"] if t["file"] != file]
        else:
            for t in r["temp"]:
                if t["file"] == file:
                    t["role"] = _role(role or "character")
        p["refs"] = r
    return mutate(style, fn)


# ---------- prompt 組裝 ----------

def cells_for(ids: list[int], ears: bool = True) -> list[str]:
    """沒有獸耳的角色：有 prompt_no_ears 的表情改用那句（耳朵豎起、炸毛之類的描述會讓 Codex 長出耳朵）"""
    meta = sticker_map()
    return [(meta[i]["prompt"] if ears else meta[i].get("prompt_no_ears") or meta[i]["prompt"])
            for i in ids if i in meta]


def preview_prompt(p: dict) -> tuple[str, list[int], str, list[str]]:
    """回傳 (prompt, 預覽用的貼圖 id, 輸出路徑, 要附給 Codex 的圖)"""
    ids = prompts.template().get("preview_ids", [1, 3, 4, 9])
    out = f"outputs/{p['id']}/grids/{p['id']}_preview.png"
    rp = ref_paths(p)
    text = prompts.build_prompt(style_block=p["style_block"], framing=p["framing"], cells=cells_for(ids, rp["ears"]),
                                output=out, identity=rp["identity"], ears=rp["ears"],
                                ref_line=prompts.ref_line(character=rp["character"], style=rp["style"], ears=rp["ears"]))
    return text, ids, out, rp["style"] + rp["character"]   # 畫風圖排前面（順序和 ref_line 的說明一致）


def group_prompt(p: dict, index: int, ids: list[int], layout: str | None = None) -> tuple[str, str, list[str]]:
    out = f"outputs/{p['id']}/grids/{p['id']}_group{index}.png"
    rp = ref_paths(p)
    pv = p["preview"]["image"]
    # 批次時有了核准樣張，畫風參考圖就不再附：樣張已經是「畫風＋這個角色」的答案，多給反而會拉偏
    text = prompts.build_prompt(style_block=p["style_block"], framing=p["framing"], cells=cells_for(ids, rp["ears"]),
                                output=out, identity=rp["identity"], ears=rp["ears"], layout=layout,
                                ref_line=prompts.ref_line(character=rp["character"], style=[], preview=pv, ears=rp["ears"]))
    return text, out, rp["character"] + [pv]


# ---------- 2. 風格預覽圖 ----------

def start_preview(style: str) -> dict:
    def fn(p):
        if p["status"] not in EDITABLE:
            raise ValueError(f"目前狀態 {p['status']} 不能預覽")
        if not p["style_block"].strip():
            raise ValueError("畫風描述是空的")
        text, ids, out, refs = preview_prompt(p)
        p["preview"] = {"image": out, "ids": ids, "prompt": text, "refs": refs, "layout": prompts.layout_for(len(ids)),
                        "status": "running", "message": "", "started": now()}
        p.update(status="previewing", error=None)
    p = mutate(style, fn)
    _pool.submit(_run_preview, style)
    return p


def _run_preview(style: str) -> None:
    p = load(style)
    pv = p["preview"]
    backup(ROOT / pv["image"])
    log = codex.log_path_for(style, "preview")
    try:
        ok, msg = codex.run_image(pv["prompt"], pv.get("refs") or [], pv["image"], pv["layout"], log)
    except Exception as e:  # noqa: BLE001
        ok, msg = False, str(e)

    def fn(p):
        p["preview"].update(status="done" if ok else "failed", message=msg, log=rel(log), finished=now())
        p["status"] = "preview_ready" if ok else "draft"
        p["error"] = None if ok else f"預覽失敗：{msg}"
    mutate(style, fn)


# ---------- 3. 確認風格 → 批次生成 ----------

def start_generate(style: str, ids: list[int], layout: str = "4x2w") -> dict:
    if layout not in prompts.GROUP_LAYOUTS:
        raise ValueError(f"不支援的版型 {layout}")
    meta = sticker_map()
    # 已刪除的表情不能再排進新的批次（已經在跑的組別重生不受影響）
    ids = [i for i in dict.fromkeys(ids) if i in meta and not meta[i].get("deleted")]
    if not ids:
        raise ValueError("請至少選一張貼圖")

    def fn(p):
        if p["status"] != "preview_ready":
            raise ValueError("請先產生並確認風格預覽圖")
        groups = []
        for n, chunk in enumerate(prompts.chunk(ids, prompts.GROUP_LAYOUTS[layout]), 1):
            lay = prompts.layout_for_group(len(chunk), layout)
            text, out, refs = group_prompt(p, n, chunk, lay)
            groups.append({"index": n, "ids": chunk, "layout": lay,
                           "prompt": text, "refs": refs, "image": out, "status": "pending", "message": "", "attempts": 0})
        p.update(sticker_ids=ids, groups=groups, group_layout=layout, status="generating", error=None)
    p = mutate(style, fn)
    for g in p["groups"]:
        _pool.submit(_run_group, style, g["index"])
    return p


def regenerate_group(style: str, index: int) -> dict:
    def fn(p):
        if p["status"] not in ("review", "generating"):
            raise ValueError(f"目前狀態 {p['status']} 不能重生")
        g = _group(p, index)
        if g["status"] in ("pending", "running"):
            raise ValueError("這組還在執行中")
        g.update(status="pending", message="")
        p["status"] = "generating"
    p = mutate(style, fn)
    _pool.submit(_run_group, style, index)
    return p


def _group(p: dict, index: int) -> dict:
    for g in p["groups"]:
        if g["index"] == index:
            return g
    raise KeyError(f"沒有第 {index} 組")


def _run_group(style: str, index: int) -> None:
    with _gen_slot():   # 最多同時跑 max_parallel 組（設定頁）
        def start(p):
            gg = _group(p, index)
            gg.update(status="running", started=now(), attempts=gg.get("attempts", 0) + 1)
        p = mutate(style, start)
        g = _group(p, index)
        backup(ROOT / g["image"])
        log = codex.log_path_for(style, f"g{index}")
        try:
            ok, msg = codex.run_image(g["prompt"], g.get("refs") or [], g["image"], g["layout"], log)
        except Exception as e:  # noqa: BLE001
            ok, msg = False, str(e)

    def fn(p):
        gg = _group(p, index)
        gg.update(status="done" if ok else "failed", message=msg, log=rel(log), finished=now())
        if all(x["status"] in ("done", "failed") for x in p["groups"]):
            p["status"] = "review"
    mutate(style, fn)


# ---------- 4. 全部確認 → 後處理 → 進 Gallery ----------

def start_finalize(style: str) -> dict:
    def fn(p):
        if p["status"] != "review":
            raise ValueError("還有組別在生成中")
        if not any(g["status"] == "done" for g in p["groups"]):
            raise ValueError("沒有成功的組別可以處理")
        p.update(status="processing", error=None)
    p = mutate(style, fn)
    _pool.submit(_finalize, style)
    return p


def _finalize(style: str) -> None:
    try:
        p = load(style)
        made = []
        for g in p["groups"]:
            if g["status"] == "done":
                made += pipeline.process_grid(style, ROOT / g["image"], g["layout"], g["ids"], p["process"])
        pipeline.build_previews(style)
        mutate(style, lambda p: p.update(status="done", finished_ids=made, error=None, finished=now()))
    except Exception as e:  # noqa: BLE001
        mutate(style, lambda p: p.update(status="review", error=f"後處理失敗：{e}"))


def recheck(style: str, target: str) -> dict:
    """不重新生成，只用目前的檢查規則重新檢查已經存在的圖（例如規則改過、或被誤判失敗）。
    target = "preview" 或組別編號"""
    def fn(p):
        if target == "preview":
            pv = p.get("preview")
            if not pv or pv.get("status") != "failed":
                raise ValueError("預覽圖沒有失敗，不需要重新檢查")
            ok, msg = codex.check_image(ROOT / pv["image"], None, pv["layout"])
            pv.update(status="done" if ok else "failed", message=msg)
            if ok and p["status"] in EDITABLE:
                p.update(status="preview_ready", error=None)
            elif not ok:
                p["error"] = f"預覽失敗：{msg}"
        else:
            g = _group(p, int(target))
            if g["status"] != "failed":
                raise ValueError("這組沒有失敗，不需要重新檢查")
            ok, msg = codex.check_image(ROOT / g["image"], None, g["layout"])
            g.update(status="done" if ok else "failed", message=msg)
    return mutate(style, fn)


def reopen(style: str) -> dict:
    """已完成的專案回到審核階段（例如想再重生某組）"""
    def fn(p):
        if p["status"] != "done":
            raise ValueError("只有已完成的專案可以重新開啟")
        p["status"] = "review"
    return mutate(style, fn)

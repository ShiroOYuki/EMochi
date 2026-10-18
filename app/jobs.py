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
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from . import codex, pipeline, prompts
from .paths import (OUTPUTS, PROMPTS_DIR, ROOT, load_styles_cfg, next_style_id, read_json,
                    save_styles_cfg, sticker_map, write_json)

MAX_PARALLEL = 3
BUSY = {"expanding", "previewing", "generating", "processing"}
EDITABLE = {"draft", "preview_ready", "error"}

_locks: dict[str, threading.Lock] = {}
_pool = ThreadPoolExecutor(max_workers=MAX_PARALLEL + 2)
_gen_slots = threading.Semaphore(MAX_PARALLEL)


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
            out.append({k: p.get(k) for k in ("id", "name", "status", "updated", "request")})
    return sorted(out, key=lambda x: x.get("updated") or "", reverse=True)


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
    return path.relative_to(ROOT).as_posix()


def backup(path: Path) -> None:
    if path.exists():
        prev = path.parent / "_prev"
        prev.mkdir(exist_ok=True)
        stamp = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y%m%d_%H%M%S")
        shutil.copy2(path, prev / f"{path.stem}_{stamp}{path.suffix}")


def save_prompt_file(style: str, name: str, text: str) -> None:
    d = PROMPTS_DIR / style
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name}.txt").write_text(text, encoding="utf-8")


# ---------- 1. 建立專案＋用 Codex 擴寫需求 ----------

def create(request: str) -> dict:
    style = next_style_id()
    p = {"id": style, "name": "", "request": request.strip(), "style_block": "", "framing": "closeup",
         "process": {"square": 0.5, "margin": 0, "min_blob": 0.0003}, "notes_zh": "",
         "status": "expanding", "error": None, "created": now(),
         "preview": None, "sticker_ids": [], "groups": []}
    with _lock(style):
        save(p)
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


def _style_examples() -> list[str]:
    """拿既有畫風的描述當範例，讓 Codex 寫出同樣格式"""
    ex = []
    for s in ("s5", "s4"):
        f = PROMPTS_DIR / s / "g1.txt"
        if f.exists():
            t = f.read_text(encoding="utf-8")
            a, b = t.find("- "), t.find("Character identity")
            if 0 <= a < b:
                ex.append(t[a:b])
    return ex


def _expand(style: str) -> None:
    try:
        p = load(style)
        schema = codex.LOGS / style / "expand_schema.json"
        schema.parent.mkdir(parents=True, exist_ok=True)
        prompts.write_schema(schema)
        answer = codex.run_text(prompts.expand_request_prompt(p["request"], _style_examples()),
                                schema, codex.log_path_for(style, "expand"))
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
    return mutate(style, fn)


# ---------- prompt 組裝 ----------

def cells_for(ids: list[int]) -> list[str]:
    meta = sticker_map()
    return [meta[i]["prompt"] for i in ids if i in meta]


def preview_prompt(p: dict) -> tuple[str, list[int], str]:
    ids = prompts.template().get("preview_ids", [1, 3, 4, 9])
    out = f"outputs/{p['id']}/grids/{p['id']}_preview.png"
    text = prompts.build_prompt(style_block=p["style_block"], framing=p["framing"], cells=cells_for(ids),
                                output=out, ref_line=prompts.template()["ref_preview"])
    return text, ids, out


def group_prompt(p: dict, index: int, ids: list[int]) -> tuple[str, str]:
    out = f"outputs/{p['id']}/grids/{p['id']}_group{index}.png"
    ref_line = prompts.template()["ref_batch"].format(preview_name=Path(p["preview"]["image"]).name)
    text = prompts.build_prompt(style_block=p["style_block"], framing=p["framing"], cells=cells_for(ids),
                                output=out, ref_line=ref_line)
    return text, out


# ---------- 2. 風格預覽圖 ----------

def start_preview(style: str) -> dict:
    def fn(p):
        if p["status"] not in EDITABLE:
            raise ValueError(f"目前狀態 {p['status']} 不能預覽")
        if not p["style_block"].strip():
            raise ValueError("畫風描述是空的")
        text, ids, out = preview_prompt(p)
        p["preview"] = {"image": out, "ids": ids, "prompt": text, "layout": prompts.layout_for(len(ids)),
                        "status": "running", "message": "", "started": now()}
        p.update(status="previewing", error=None)
    p = mutate(style, fn)
    _pool.submit(_run_preview, style)
    return p


def _run_preview(style: str) -> None:
    p = load(style)
    pv = p["preview"]
    backup(ROOT / pv["image"])
    save_prompt_file(style, "preview", pv["prompt"])
    log = codex.log_path_for(style, "preview")
    try:
        ok, msg = codex.run_image(pv["prompt"], ["refs/ref.png"], pv["image"], pv["layout"], log)
    except Exception as e:  # noqa: BLE001
        ok, msg = False, str(e)

    def fn(p):
        p["preview"].update(status="done" if ok else "failed", message=msg, log=rel(log), finished=now())
        p["status"] = "preview_ready" if ok else "draft"
        p["error"] = None if ok else f"預覽失敗：{msg}"
    mutate(style, fn)


# ---------- 3. 確認風格 → 批次生成 ----------

def start_generate(style: str, ids: list[int]) -> dict:
    meta = sticker_map()
    ids = [i for i in dict.fromkeys(ids) if i in meta]
    if not ids:
        raise ValueError("請至少選一張貼圖")

    def fn(p):
        if p["status"] != "preview_ready":
            raise ValueError("請先產生並確認風格預覽圖")
        groups = []
        for n, chunk in enumerate(prompts.chunk(ids), 1):
            text, out = group_prompt(p, n, chunk)
            groups.append({"index": n, "ids": chunk, "layout": prompts.layout_for(len(chunk)),
                           "prompt": text, "image": out, "status": "pending", "message": "", "attempts": 0})
        p.update(sticker_ids=ids, groups=groups, status="generating", error=None)
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
    with _gen_slots:   # 最多同時跑 MAX_PARALLEL 組
        def start(p):
            gg = _group(p, index)
            gg.update(status="running", started=now(), attempts=gg.get("attempts", 0) + 1)
        p = mutate(style, start)
        g = _group(p, index)
        backup(ROOT / g["image"])
        save_prompt_file(style, f"g{index}", g["prompt"])
        log = codex.log_path_for(style, f"g{index}")
        try:
            ok, msg = codex.run_image(g["prompt"], ["refs/ref.png", p["preview"]["image"]],
                                      g["image"], g["layout"], log)
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
        cfg = load_styles_cfg()
        cfg.setdefault("styles", {})[style] = {
            "name": p["name"], "refs": ["refs/ref.png"], "group1_refs": [],
            "process": {"square": p["process"].get("square"), "margin": p["process"].get("margin", 0)}}
        save_styles_cfg(cfg)
        mutate(style, lambda p: p.update(status="done", finished_ids=made, error=None, finished=now()))
    except Exception as e:  # noqa: BLE001
        mutate(style, lambda p: p.update(status="review", error=f"後處理失敗：{e}"))


def reopen(style: str) -> dict:
    """已完成的專案回到審核階段（例如想再重生某組）"""
    def fn(p):
        if p["status"] != "done":
            raise ValueError("只有已完成的專案可以重新開啟")
        p["status"] = "review"
    return mutate(style, fn)

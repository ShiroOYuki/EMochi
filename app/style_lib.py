"""畫風庫：style_lib/<id>/style.json ＋ refs/

style.json
  id（st1、st2…）, name, request（中文補充說明，可空）,
  style_block（英文畫風描述，放進 prompt 的 Art style 段落）, framing（closeup / whole）,
  process: {square, margin}, notes_zh,
  images: [{file, use, source}]   use = 套用到新專案時是否附上這張當畫風參考
  source_project                  從哪個畫風專案匯入（可空）
  next_index                      下一張圖的流水號（ref_01.png…，只增不減，同角色庫）

流程：上傳範例貼圖 → analyze() 讓 Codex 看圖寫描述 → 手動微調 → Gen 新增畫風時直接套用。
"""
import json
import re
import shutil
import threading
from datetime import datetime
from pathlib import Path

from . import codex, prompts
from .images import move_to_removed, save_png
from .paths import OUTPUTS, PROMPTS_DIR, ROOT, load_styles_cfg, read_json, write_json

LIB_DIR = ROOT / "style_lib"
_lock = threading.Lock()
STD_RE = re.compile(r"^ref_(\d{2,})\.png$")
PROCESS = {"closeup": {"square": 0.5, "margin": 0}, "whole": {"square": None, "margin": 0.04}}


def _json(sid: str) -> Path:
    return LIB_DIR / sid / "style.json"


def refs_dir(sid: str) -> Path:
    return LIB_DIR / sid / "refs"


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get(sid: str) -> dict | None:
    s = read_json(_json(sid))
    if s:
        s["images"] = [i for i in s.get("images", []) if (refs_dir(sid) / i["file"]).exists()]
    return s


def list_all() -> list[dict]:
    out = [s for f in sorted(LIB_DIR.glob("*/style.json")) if (s := get(f.parent.name))] if LIB_DIR.exists() else []
    return sorted(out, key=lambda s: s.get("created", ""))


def _save(s: dict) -> dict:
    s["updated"] = now()
    write_json(_json(s["id"]), s)
    return s


def _new_id() -> str:
    from .trash import reserved_ids
    used = reserved_ids("styles")
    n = 1
    while (LIB_DIR / f"st{n}").exists() or f"st{n}" in used:
        n += 1
    return f"st{n}"


def _take_name(s: dict) -> str:
    used = [int(m.group(1)) for i in s["images"] if (m := STD_RE.match(i["file"]))]
    n = max([s.get("next_index", 1), *(u + 1 for u in used)])
    while (refs_dir(s["id"]) / f"ref_{n:02d}.png").exists():
        n += 1
    s["next_index"] = n + 1
    return f"ref_{n:02d}.png"


def _store(s: dict, files: list[tuple[str, bytes]]) -> None:
    for fname, raw in files:
        s["images"].append({"file": save_png(raw, refs_dir(s["id"]), fname, exact=_take_name(s)),
                            "use": True, "source": fname})


def _blank(name: str, request: str = "") -> dict:
    return {"id": _new_id(), "name": name.strip(), "request": request.strip(), "style_block": "", "framing": "closeup",
            "process": dict(PROCESS["closeup"]), "notes_zh": "", "images": [], "source_project": None,
            "next_index": 1, "created": now()}


def create(name: str, files: list[tuple[str, bytes]], request: str = "") -> dict:
    if not files:
        raise ValueError("請至少上傳一張範例貼圖")
    with _lock:
        s = _blank(name, request)
        _store(s, files)
        return _save(s)


def update(sid: str, fields: dict) -> dict:
    with _lock:
        s = get(sid)
        if not s:
            raise KeyError(sid)
        for k in ("name", "request", "style_block", "notes_zh"):
            if k in fields:
                s[k] = fields[k]
        if fields.get("framing") in PROCESS:
            s["framing"] = fields["framing"]
        if isinstance(fields.get("process"), dict):
            s["process"].update({k: v for k, v in fields["process"].items() if k in ("square", "margin")})
        if "use" in fields:   # {file: bool}
            for i in s["images"]:
                if i["file"] in fields["use"]:
                    i["use"] = bool(fields["use"][i["file"]])
        return _save(s)


def add_images(sid: str, files: list[tuple[str, bytes]]) -> dict:
    with _lock:
        s = get(sid)
        if not s:
            raise KeyError(sid)
        _store(s, files)
        return _save(s)


def remove_image(sid: str, file: str) -> dict:
    with _lock:
        s = get(sid)
        if not s:
            raise KeyError(sid)
        move_to_removed(refs_dir(sid) / Path(file).name)
        s["images"] = [i for i in s["images"] if i["file"] != file]
        return _save(s)


def delete(sid: str) -> None:
    """整個畫風移到垃圾桶 style_lib/_removed/（見 trash.py）"""
    from .trash import move_to_trash
    with _lock:
        move_to_trash("styles", sid)


def rel_paths(sid: str, used_only: bool = True) -> list[str]:
    s = get(sid) or {"images": []}
    return [(refs_dir(sid) / i["file"]).relative_to(ROOT).as_posix() for i in s["images"] if i["use"] or not used_only]


# ---------- 讓 Codex 看範例貼圖寫畫風描述 ----------

def analyze(sid: str, examples: list[str], request: str | None = None) -> dict:
    """同步執行（30~90 秒）。request 有給就先存起來，當作文字補充"""
    s = get(sid)
    if not s:
        raise KeyError(sid)
    if request is not None:
        s = update(sid, {"request": request})
    imgs = rel_paths(sid)
    if not imgs:
        raise ValueError("請至少勾選一張範例貼圖")
    schema = codex.LOGS / "style_lib" / f"{sid}_schema.json"
    schema.parent.mkdir(parents=True, exist_ok=True)
    prompts.write_schema(schema)
    answer = codex.run_text(prompts.expand_request_prompt(s.get("request", ""), examples, imgs),
                            schema, codex.log_path_for("style_lib", f"{sid}_analyze"), images=imgs)
    data = json.loads(answer)
    framing = data["framing"] if data.get("framing") in PROCESS else "closeup"
    return update(sid, {
        "name": s["name"] or data["name"], "style_block": data["style_block"], "framing": framing,
        "notes_zh": data.get("notes_zh", ""),
        "process": {"square": data.get("square", PROCESS[framing]["square"]), "margin": data.get("margin", PROCESS[framing]["margin"])},
    })


# ---------- 從既有畫風專案匯入 ----------

def _legacy_block(style: str) -> str:
    f = PROMPTS_DIR / style / "g1.txt"
    if not f.exists():
        return ""
    t = f.read_text(encoding="utf-8")
    a, b = t.find("- "), t.find("Character identity")
    return t[a:b].strip() if 0 <= a < b else ""


def importable() -> list[dict]:
    """可以匯入的畫風專案：網頁工具建立的（有 project.json 且已有描述）＋ s1～s5 舊畫風"""
    out, seen = [], set()
    for f in sorted(OUTPUTS.glob("*/project.json")):
        p = read_json(f) or {}
        if p.get("style_block"):
            img = (p.get("preview") or {}).get("image")
            out.append({"id": p["id"], "name": p.get("name", ""), "image": img if img and (ROOT / img).exists() else None})
            seen.add(p["id"])
    for sid, cfg in load_styles_cfg().get("styles", {}).items():
        img = f"outputs/{sid}/grids/{sid}_group1.png"
        has_img, block = (ROOT / img).exists(), _legacy_block(sid)
        if sid not in seen and (block or has_img):
            # s1 這種最早期的畫風沒有文字描述（當時直接照抄參考圖畫法），只能帶圖匯入、再讓 Codex 分析
            out.append({"id": sid, "name": cfg.get("name", ""), "image": img if has_img else None, "needs_analyze": not block})
    imported = {s.get("source_project") for s in list_all()}
    for o in out:
        o["imported"] = o["id"] in imported
    return sorted(out, key=lambda o: int(re.sub(r"\D", "", o["id"]) or 0))


def import_project(style: str, extra_refs: list[str] | None = None) -> dict:
    """把畫風專案的描述存成畫風庫的一筆。範例圖用專案自己生出來的圖（預覽或第一組）＋ extra_refs"""
    p = read_json(OUTPUTS / style / "project.json")
    if p and p.get("style_block"):
        name, request, block = p.get("name", ""), p.get("request", ""), p["style_block"]
        framing, process, notes = p.get("framing", "closeup"), p.get("process") or {}, p.get("notes_zh", "")
        sample = (p.get("preview") or {}).get("image")
    else:
        cfg = load_styles_cfg().get("styles", {}).get(style)
        block = _legacy_block(style)
        if not cfg or not (block or (OUTPUTS / style / "grids" / f"{style}_group1.png").exists()):
            raise KeyError(f"畫風專案 {style}")
        name, request, notes, process = cfg.get("name", ""), "", "", cfg.get("process") or {}
        framing = "whole" if process.get("square") is None else "closeup"
        sample = f"outputs/{style}/grids/{style}_group1.png"
    files = []
    for rel in [sample, *(extra_refs or [])]:
        if rel and (ROOT / rel).exists():
            files.append((Path(rel).name, (ROOT / rel).read_bytes()))
    if not files and not block:
        raise ValueError(f"{style} 沒有描述也沒有圖可以匯入")
    with _lock:
        s = _blank(name or style, request)
        s.update(style_block=block, framing=framing if framing in PROCESS else "closeup", notes_zh=notes,
                 source_project=style,
                 process={"square": process.get("square", 0.5), "margin": process.get("margin", 0)})
        _store(s, files)
        return _save(s)

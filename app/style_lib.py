"""畫風庫：style_lib/<id>/style.json ＋ refs/

style.json
  id（st1、st2…）, name, request（中文補充說明，可空）,
  style_block（英文畫風描述，放進 prompt 的 Art style 段落）, framing（closeup / whole）,
  process: {square, margin}, notes_zh,
  images: [{file, use, source}]   use = 套用到新專案時是否附上這張當畫風參考
  source_project                  從哪個畫風專案匯入（可空）
  next_index                      下一張圖的流水號（規則見 reflib.py，和角色庫共用）

流程：上傳範例貼圖 → analyze() 讓 Codex 看圖寫描述 → 手動微調 → Gen 新增畫風時直接套用。

內建範例：config/style_lib.example/<id>/（目前是 st1 暖柔奶油萌繪）。全新安裝第一次啟動、畫風庫資料夾還不存在時
seed_defaults() 複製過去；之後使用者刪掉、修改都不會被覆蓋，也不會再長回來（資料夾已經存在就不動）。
"""

import json
import re
import shutil
from pathlib import Path

from . import codex, prompts
from .errors import Invalid, NotFound
from .paths import BUILTIN_CONFIG, codex_path, data_path, outputs_dir, read_json, style_lib_dir
from .reflib import RefLibrary, now

# lambda：每次用到才查模組裡的 *_dir（設定改路徑、測試 monkeypatch 都會跟著變）
_lib = RefLibrary(lambda: style_lib_dir(), "style.json", "styles", "st")
_lock = _lib.lock
refs_dir, get, list_all, _save = _lib.refs_dir, _lib.get, _lib.list_all, _lib.save
add_images, remove_image, delete = _lib.add_images, _lib.remove_image, _lib.delete
PROCESS = {"closeup": {"square": 0.5, "margin": 0}, "whole": {"square": None, "margin": 0.04}}


BUILTIN_STYLES = BUILTIN_CONFIG / "style_lib.example"


def seed_defaults() -> list[str]:
    """全新安裝：畫風庫資料夾還不存在 → 建立並放進內建範例畫風。回傳放進去的 id"""
    root = style_lib_dir()
    if root.exists() or not BUILTIN_STYLES.is_dir():
        return []
    root.mkdir(parents=True, exist_ok=True)
    added = []
    for src in sorted(BUILTIN_STYLES.iterdir()):
        if (src / "style.json").is_file():
            shutil.copytree(src, root / src.name)
            added.append(src.name)
    return added


def _blank(name: str, request: str = "") -> dict:
    return {
        "id": _lib.new_id(),
        "name": name.strip(),
        "request": request.strip(),
        "style_block": "",
        "framing": "closeup",
        "process": dict(PROCESS["closeup"]),
        "notes_zh": "",
        "images": [],
        "source_project": None,
        "next_index": 1,
        "created": now(),
    }


def create(name: str, files: list[tuple[str, bytes]], request: str = "") -> dict:
    if not files:
        raise Invalid("請至少上傳一張範例貼圖")
    with _lock:
        s = _blank(name, request)
        _lib.store(s, files)
        return _save(s)


def update(sid: str, fields: dict) -> dict:
    with _lock:
        s = _lib.require(sid)
        for k in ("name", "request", "style_block", "notes_zh"):
            if k in fields:
                s[k] = fields[k]
        if fields.get("framing") in PROCESS:
            s["framing"] = fields["framing"]
        if isinstance(fields.get("process"), dict):
            s["process"].update({k: v for k, v in fields["process"].items() if k in ("square", "margin")})
        if "use" in fields:  # {file: bool}
            _lib.apply_use(s, fields["use"])
        return _save(s)


def rel_paths(sid: str, used_only: bool = True) -> list[str]:
    s = get(sid) or {"images": []}
    return [codex_path(refs_dir(sid) / i["file"]) for i in s["images"] if i["use"] or not used_only]


# ---------- 讓 Codex 看範例貼圖寫畫風描述 ----------


def analyze(sid: str, examples: list[str], request: str | None = None) -> dict:
    """同步執行（30~90 秒）。request 有給就先存起來，當作文字補充"""
    s = get(sid)
    if not s:
        raise NotFound(f"畫風 {sid}")
    if request is not None:
        s = update(sid, {"request": request})
    imgs = rel_paths(sid)
    if not imgs:
        raise Invalid("請至少勾選一張範例貼圖")
    schema = codex.logs_dir() / "style_lib" / f"{sid}_schema.json"
    schema.parent.mkdir(parents=True, exist_ok=True)
    prompts.write_schema(schema)
    answer = codex.run_text(
        prompts.expand_request_prompt(s.get("request", ""), examples, imgs),
        schema,
        codex.log_path_for("style_lib", f"{sid}_analyze"),
        images=imgs,
    )
    data = json.loads(answer)
    framing = data["framing"] if data.get("framing") in PROCESS else "closeup"
    return update(
        sid,
        {
            "name": s["name"] or data["name"],
            "style_block": data["style_block"],
            "framing": framing,
            "notes_zh": data.get("notes_zh", ""),
            "process": {
                "square": data.get("square", PROCESS[framing]["square"]),
                "margin": data.get("margin", PROCESS[framing]["margin"]),
            },
        },
    )


# ---------- 從既有畫風專案匯入 ----------


def _sample(p: dict) -> str | None:
    """專案自己生出來、最能代表畫風的圖：預覽圖，沒有的話（s1～s5 舊流程沒做預覽）用第 1 組網格"""
    for img in [(p.get("preview") or {}).get("image"), *(g.get("image") for g in p.get("groups", []))]:
        if img and data_path(img).exists():
            return img
    return None


def importable() -> list[dict]:
    """可以匯入的畫風專案：有描述或至少有一張生成圖的。
    沒有描述的（s1 這種最早期、直接照參考圖畫法的）只能帶圖匯入，再讓 Codex 分析"""
    out = []
    for f in sorted(outputs_dir().glob("*/project.json")):
        p = read_json(f) or {}
        block, img = (p.get("style_block") or "").strip(), _sample(p)
        if block or img:
            out.append({"id": p["id"], "name": p.get("name", ""), "image": img, "needs_analyze": not block})
    imported = {s.get("source_project") for s in list_all()}
    for o in out:
        o["imported"] = o["id"] in imported
    return sorted(out, key=lambda o: int(re.sub(r"\D", "", o["id"]) or 0))


def import_project(style: str, extra_refs: list[str] | None = None) -> dict:
    """把畫風專案的描述存成畫風庫的一筆。範例圖用專案自己生出來的圖（預覽或第一組）＋ extra_refs"""
    p = read_json(outputs_dir() / style / "project.json")
    if not p:
        raise NotFound(f"畫風專案 {style}")
    name, request, block = p.get("name", ""), p.get("request", ""), (p.get("style_block") or "").strip()
    framing, process, notes = p.get("framing", "closeup"), p.get("process") or {}, p.get("notes_zh", "")
    sample = _sample(p)
    files = []
    for rel in [sample, *(extra_refs or [])]:
        if rel and data_path(rel).exists():
            files.append((Path(rel).name, data_path(rel).read_bytes()))
    if not files and not block:
        raise Invalid(f"{style} 沒有描述也沒有圖可以匯入")
    with _lock:
        s = _blank(name or style, request)
        s.update(
            style_block=block,
            framing=framing if framing in PROCESS else "closeup",
            notes_zh=notes,
            source_project=style,
            process={"square": process.get("square", 0.5), "margin": process.get("margin", 0)},
        )
        _lib.store(s, files)
        return _save(s)

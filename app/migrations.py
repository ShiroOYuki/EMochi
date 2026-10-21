"""資料檔格式升級：舊版存的檔案，讀進來時先升到最新格式，之後的程式只需要處理最新格式

project.json 用 schema_version 記版本（沒有這個欄位＝0）。讀檔時在記憶體裡升級，
下次存檔（save／mutate）自然寫回新格式；不會為了升級主動改寫使用者的檔案。
新增格式變更時：把 PROJECT_VERSION 加 1、在 _PROJECT_STEPS 加一個函式、在 tests/test_migrations.py 加測試。

character.json、style.json 也一樣（LIBRARY_VERSION，RefLibrary 讀檔時升級、存檔時寫回）。
export_presets.json 是陣列、沒地方放版本號，用 migrate_presets() 依欄位有沒有來判斷。
"""

from collections.abc import Callable

PROJECT_VERSION = 1


def _project_v1(p: dict) -> dict:
    """v0 → v1：補齊早期專案（s1～s5 等）可能缺的欄位，讓 refs、preview、groups 一定存在"""
    refs = p.get("refs") or {}
    p["refs"] = {
        "character_id": refs.get("character_id"),
        "character_images": refs.get("character_images"),
        "temp": list(refs.get("temp") or []),
    }
    p.setdefault("preview", None)  # 最早期的專案 preview 是 null 或沒有
    p.setdefault("groups", [])
    p.setdefault("sticker_ids", [])
    p.setdefault("error", None)
    p.setdefault("notes_zh", "")
    p.setdefault("name", "")
    p.setdefault("request", "")
    p.setdefault("framing", "closeup")
    process = p.setdefault("process", {})
    process.setdefault("square", 0.5 if p["framing"] == "closeup" else None)
    process.setdefault("margin", 0)
    process.setdefault("min_blob", 0.0003)
    return p


# 第 i 個函式把 version i 升到 i+1
_PROJECT_STEPS: list[Callable[[dict], dict]] = [_project_v1]
assert len(_PROJECT_STEPS) == PROJECT_VERSION


def migrate_project(p: dict | None) -> dict | None:
    """把讀進來的 project.json 升到最新格式（原地修改並回傳）；None 照樣回傳 None"""
    return _run(p, _PROJECT_STEPS, PROJECT_VERSION)


def migrate_presets(items: list[dict], builtin: list[dict]) -> list[dict]:
    """export_presets.json：舊版沒有 group → 跟內建同 id 的補上內建的分組（其他的留空＝「其他」）"""
    groups = {b["id"]: b.get("group", "") for b in builtin}
    return [p if "group" in p else {**p, "group": groups.get(p.get("id"), "")} for p in items]


# ---------- 角色庫（character.json）、畫風庫（style.json） ----------
# 一樣用 schema_version；RefLibrary.get 讀檔時升級，save 時寫回目前版本

LIBRARY_VERSION = 1


def _library_common_v1(d: dict) -> dict:
    d.setdefault("name", d.get("id", ""))
    d.setdefault("notes_zh", "")
    d["images"] = [
        {
            "file": i["file"],
            "use": bool(i.get("use", True)),
            **({"source": i["source"]} if i.get("source") else {}),
        }
        for i in d.get("images") or []
        if isinstance(i, dict) and i.get("file")
    ]
    d.setdefault("next_index", 1)  # RefLibrary 存圖時會再跟現有檔名比對，不會撞號
    d.setdefault("created", "")
    d.setdefault("updated", d["created"])
    return d


def _character_v1(d: dict) -> dict:
    d = _library_common_v1(d)
    d.setdefault("identity", "")
    d.setdefault("ears", None)  # None＝由特徵句自動判斷
    return d


def _style_v1(d: dict) -> dict:
    d = _library_common_v1(d)
    d.setdefault("request", "")
    d.setdefault("style_block", "")
    d.setdefault("framing", "closeup")
    process = d.setdefault("process", {})
    process.setdefault("square", 0.5 if d["framing"] == "closeup" else None)
    process.setdefault("margin", 0 if d["framing"] == "closeup" else 0.04)
    d.setdefault("source_project", None)
    return d


_CHARACTER_STEPS: list[Callable[[dict], dict]] = [_character_v1]
_STYLE_STEPS: list[Callable[[dict], dict]] = [_style_v1]
assert len(_CHARACTER_STEPS) == len(_STYLE_STEPS) == LIBRARY_VERSION


def _run(d: dict | None, steps: list[Callable[[dict], dict]], latest: int) -> dict | None:
    if d is None:
        return None
    for step in steps[int(d.get("schema_version") or 0) :]:
        d = step(d)
    d["schema_version"] = latest
    return d


def migrate_character(d: dict | None) -> dict | None:
    return _run(d, _CHARACTER_STEPS, LIBRARY_VERSION)


def migrate_style(d: dict | None) -> dict | None:
    return _run(d, _STYLE_STEPS, LIBRARY_VERSION)

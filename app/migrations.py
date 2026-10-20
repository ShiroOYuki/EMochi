"""資料檔格式升級：舊版存的檔案，讀進來時先升到最新格式，之後的程式只需要處理最新格式

project.json 用 schema_version 記版本（沒有這個欄位＝0）。讀檔時在記憶體裡升級，
下次存檔（save／mutate）自然寫回新格式；不會為了升級主動改寫使用者的檔案。
新增格式變更時：把 PROJECT_VERSION 加 1、在 _PROJECT_STEPS 加一個函式、在 tests/test_migrations.py 加測試。

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
    if p is None:
        return None
    version = int(p.get("schema_version") or 0)
    for step in _PROJECT_STEPS[version:]:
        p = step(p)
    p["schema_version"] = PROJECT_VERSION
    return p


def migrate_presets(items: list[dict], builtin: list[dict]) -> list[dict]:
    """export_presets.json：舊版沒有 group → 跟內建同 id 的補上內建的分組（其他的留空＝「其他」）"""
    groups = {b["id"]: b.get("group", "") for b in builtin}
    return [p if "group" in p else {**p, "group": groups.get(p.get("id"), "")} for p in items]

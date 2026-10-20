"""資料檔格式升級：舊的 project.json 讀進來要補齊欄位；最新版不變；新專案帶版本號"""

import copy

from app.migrations import PROJECT_VERSION, migrate_presets, migrate_project

OLD = {  # 早期專案（類似 s1～s5）：沒有 refs、preview、版本號，process 少欄位
    "id": "s1",
    "style_block": "x",
    "framing": "whole",
    "process": {"margin": 0.04},
    "status": "done",
    "created": "",
    "updated": "",
}


def test_v0_project_gets_all_fields():
    p = migrate_project(copy.deepcopy(OLD))
    assert p["schema_version"] == PROJECT_VERSION
    assert p["refs"] == {"character_id": None, "character_images": None, "temp": []}
    assert p["preview"] is None and p["groups"] == [] and p["sticker_ids"] == []
    assert p["process"] == {"square": None, "margin": 0.04, "min_blob": 0.0003}  # whole → square None
    assert p["status"] == "done" and p["style_block"] == "x"


def test_latest_is_unchanged_and_none_passes_through():
    p = migrate_project(copy.deepcopy(OLD))
    again = migrate_project(copy.deepcopy(p))
    assert again == p
    assert migrate_project(None) is None


def test_load_migrates_in_memory_only(data_root):
    """讀檔時升級，但不會主動改寫檔案（下次存檔才寫回）"""
    import shutil

    from app import jobs
    from app.paths import read_json, write_json

    path = data_root / "outputs" / "s906" / "project.json"
    write_json(path, {**OLD, "id": "s906"})
    try:
        assert jobs.load("s906")["schema_version"] == PROJECT_VERSION
        assert "schema_version" not in read_json(path)
        assert any(x["id"] == "s906" and x["character_id"] is None for x in jobs.list_projects())
    finally:
        shutil.rmtree(path.parent, ignore_errors=True)


def test_presets_fill_group_from_builtin():
    builtin = [{"id": "twitch", "group": "Twitch"}]
    out = migrate_presets([{"id": "twitch"}, {"id": "mine"}, {"id": "x", "group": "自訂"}], builtin)
    assert [p["group"] for p in out] == ["Twitch", "", "自訂"]

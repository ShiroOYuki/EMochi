"""錯誤類別 → HTTP 狀態碼：NotFound 404、Invalid 400、Conflict 409、其他例外 500"""

from app.errors import Conflict, Invalid, NotFound


def test_not_found_is_key_error_with_readable_message():
    e = NotFound("角色 c9")
    assert isinstance(e, KeyError)
    assert str(e) == "找不到角色 c9"
    assert isinstance(Invalid("x"), ValueError) and isinstance(Conflict("x"), ValueError)


def test_status_codes(client):
    r = client.get("/api/projects/s999")
    assert r.status_code == 404
    r = client.post("/api/projects/s999/preview")
    assert r.status_code == 404 and r.json()["detail"] == "找不到專案 s999"
    r = client.post("/api/projects", json={"request": "", "temp_refs": []})
    assert r.status_code == 400 and "請描述想要的畫風" in r.json()["detail"]


def test_conflict_and_bug_status(client, monkeypatch):
    from app import jobs

    def busy(_style):
        raise Conflict("專案正在執行中，等它結束再刪除")

    monkeypatch.setattr(jobs, "delete", busy)
    r = client.delete("/api/projects/s1")
    assert r.status_code == 409

    def bug(_style):
        return {}["missing"]  # 程式 bug 造成的 KeyError 不該變成 404

    monkeypatch.setattr(jobs, "delete", bug)
    r = client.delete("/api/projects/s1")
    assert r.status_code == 500 and "missing" in r.json()["detail"]


def test_patch_models(client, data_root):
    """PATCH 用 Pydantic model：只改有傳的欄位、不認得的值回 422"""
    import shutil

    from app import jobs
    from app.paths import write_json

    sid = "s905"
    write_json(
        data_root / "outputs" / sid / "project.json",
        {
            "id": sid,
            "name": "舊名",
            "request": "r",
            "style_block": "x",
            "framing": "closeup",
            "process": {"square": 0.5, "margin": 0, "min_blob": 0.0003},
            "notes_zh": "",
            "refs": {"character_id": None, "character_images": None, "temp": []},
            "status": "draft",
            "error": None,
            "created": "",
            "preview": None,
            "sticker_ids": [],
            "groups": [],
        },
    )
    try:
        r = client.patch(f"/api/projects/{sid}", json={"name": "新名", "process": {"margin": 0.04}})
        assert r.status_code == 200
        p = jobs.load(sid)
        assert p["name"] == "新名" and p["request"] == "r"
        assert p["process"] == {"square": 0.5, "margin": 0.04, "min_blob": 0.0003}  # 沒傳的 square 不動
        assert client.patch(f"/api/projects/{sid}", json={"framing": "huge"}).status_code == 422

        r = client.post("/api/characters", json={"name": "PATCH 測試"})
        cid = r.json()["id"]
        r = client.patch(f"/api/characters/{cid}", json={"ears": None})
        assert r.status_code == 200 and r.json()["ears"] is None and r.json()["name"] == "PATCH 測試"
        client.delete(f"/api/characters/{cid}")
    finally:
        shutil.rmtree(data_root / "outputs" / sid, ignore_errors=True)

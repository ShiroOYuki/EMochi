"""設定頁：路徑檢查、改位置（搬移／只改路徑／衝突）、project.json 路徑改寫、立即生效"""
import json
import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def clean(data_root):
    """每個測試結束把設定還原（刪掉 settings.local.json），不影響其他測試"""
    yield
    f = data_root / "settings.local.json"
    if f.exists():
        f.unlink()


@pytest.fixture
def ext():
    """專案資料夾外面的位置"""
    return Path(tempfile.mkdtemp(prefix="emochi_ext_"))


def test_info_and_validate(client, clean):
    d = client.get("/api/settings").json()
    assert [x["key"] for x in d["dirs"]] == ["outputs_dir", "logs_dir", "config_dir", "exports_dir", "characters_dir", "style_lib_dir"]
    assert d["values"]["max_parallel"] == 3 and d["values"]["default_layout"] == "4x2w"
    assert client.put("/api/settings", json={"changes": {"max_parallel": 9}}).status_code == 400
    assert client.put("/api/settings", json={"changes": {"default_layout": "9x9"}}).status_code == 400
    r = client.put("/api/settings", json={"changes": {"max_parallel": 2, "default_layout": "3x2", "image_timeout_min": 15}})
    assert r.status_code == 200 and r.json()["values"]["max_parallel"] == 2
    assert client.get("/api/projects").json()["default_layout"] == "3x2"
    from app import settings
    assert settings.get("image_timeout_min") == 15


def test_check(client, data_root, clean, ext):
    chk = lambda k, v: client.post("/api/settings/check", json={"key": k, "value": v}).json()
    R = data_root
    assert "完整路徑" in chk("logs_dir", "my_logs")["error"]          # 一律要完整路徑
    assert "完整路徑" in chk("logs_dir", "")["error"]
    assert "outputs" in chk("logs_dir", str(R / "outputs"))["error"]
    assert chk("logs_dir", str(R / "outputs" / "x"))["error"]
    assert chk("logs_dir", str(R))["error"]
    assert "重疊" in chk("logs_dir", str(R / "characters" / "sub"))["error"]
    (R / "afile.txt").write_text("x")
    assert "檔案" in chk("logs_dir", str(R / "afile.txt"))["error"]
    ok = chk("characters_dir", str(ext / "chars"))
    assert ok["error"] is None and "絕對路徑" in ok["warn"] and "建立" in ok["warn"]
    assert chk("logs_dir", str(R / "my_logs"))["error"] is None
    d = next(x for x in client.get("/api/settings").json()["dirs"] if x["key"] == "logs_dir")
    assert d["value"] == str((R / "logs").resolve()) == d["default"]   # 預設也顯示完整路徑
    assert client.put("/api/settings", json={"changes": {"logs_dir": "relative"}}).status_code == 400


def test_move_logs_and_rewrite(client, data_root, clean, ext):
    from app import paths
    log = data_root / "logs" / "s70" / "g1_20261019_100000.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text("[2026-10-19 10:00:00] start\ntokens used\n1,234\n\n[2026-10-19 10:01:00] exit exit=0\n")
    proj = data_root / "outputs" / "s70" / "project.json"
    proj.parent.mkdir(parents=True, exist_ok=True)
    proj.write_text(json.dumps({"id": "s70", "name": "t", "status": "done", "groups": [
        {"index": 1, "log": "logs/s70/g1_20261019_100000.log", "refs": ["logsX/keep.png"]}]}), encoding="utf-8")
    new = ext / "L"
    plan = client.post("/api/settings/plan", json={"changes": {"logs_dir": str(new)}}).json()
    assert plan["dirs"][0]["files"] >= 1 and plan["dirs"][0]["conflict_count"] == 0
    r = client.put("/api/settings", json={"changes": {"logs_dir": str(new)}, "move": True})
    assert r.status_code == 200, r.text
    assert (new / "s70" / log.name).exists() and not log.exists()
    assert paths.logs_dir() == new.resolve()
    p = json.loads(proj.read_text(encoding="utf-8"))
    assert p["groups"][0]["log"] == (new / "s70" / log.name).resolve().as_posix()
    assert p["groups"][0]["refs"] == ["logsX/keep.png"]           # 只換開頭完全相符的
    assert client.get("/api/projects/s70/log", params={"path": p["groups"][0]["log"]}).status_code == 200
    # 搬回預設
    r = client.put("/api/settings", json={"changes": {"logs_dir": str(data_root / "logs")}, "move": True})
    assert r.status_code == 200 and log.exists()
    assert not (data_root / "settings.local.json").exists() or "logs_dir" not in json.loads((data_root / "settings.local.json").read_text())   # 和預設一樣就不存
    assert json.loads(proj.read_text(encoding="utf-8"))["groups"][0]["log"] == "logs/s70/g1_20261019_100000.log"


def test_conflict_and_keep_path(client, data_root, clean, ext):
    from app import paths
    (data_root / "exports").mkdir(exist_ok=True)
    (data_root / "exports" / "a.json").write_text('{"v": "old"}')
    new = ext / "E"
    new.mkdir()
    (new / "a.json").write_text('{"v": "new"}')
    body = {"changes": {"exports_dir": str(new)}, "move": True}
    assert client.put("/api/settings", json=body).status_code == 400      # 有衝突沒說怎麼辦
    r = client.put("/api/settings", json={**body, "conflict": "keep"})
    assert r.json()["report"]["moved"][0]["skipped"] == 1
    assert json.loads((new / "a.json").read_text())["v"] == "new"
    # 只改路徑：檔案不動
    r = client.put("/api/settings", json={"changes": {"exports_dir": str(data_root / "exports")}, "move": False})
    assert r.status_code == 200 and paths.exports_dir() == (data_root / "exports").resolve()
    assert (new / "a.json").exists()


def test_characters_dir_live(client, data_root, clean, ext):
    """角色庫搬到專案外：清單、/files/ 圖片、給 Codex 的路徑都跟著走"""
    from app import characters
    c = client.post("/api/characters", json={"name": "外面的角色", "images": []}).json()
    new = ext / "C"
    r = client.put("/api/settings", json={"changes": {"characters_dir": str(new)}, "move": True})
    assert r.status_code == 200, r.text
    assert (new / c["id"] / "character.json").exists()
    assert c["id"] in [x["id"] for x in client.get("/api/characters").json()]
    (new / c["id"] / "refs").mkdir(exist_ok=True)
    from PIL import Image
    Image.new("RGB", (8, 8)).save(new / c["id"] / "refs" / "ref_01.png")
    assert client.get(f"/files/characters/{c['id']}/refs/ref_01.png").status_code == 200
    assert client.get(f"/files/characters/../outputs/x.png").status_code == 404
    data = json.loads((new / c["id"] / "character.json").read_text(encoding="utf-8"))
    data["images"] = [{"file": "ref_01.png", "use": True}]
    (new / c["id"] / "character.json").write_text(json.dumps(data), encoding="utf-8")
    assert characters.rel_paths(c["id"])[0] == (new / c["id"] / "refs" / "ref_01.png").resolve().as_posix()
    client.put("/api/settings", json={"changes": {"characters_dir": str(data_root / "characters")}, "move": True})


def test_config_dir_and_busy(client, data_root, clean, ext):
    from app import codex, paths
    client.patch("/api/stickers/2", json={"zh": "設定頁測試"})     # 寫出 stickers.json
    new = ext / "cfg"
    codex.ACTIVE["x"] = {"pid": 1, "started": 0}
    try:
        assert client.put("/api/settings", json={"changes": {"config_dir": str(new)}}).status_code == 400
    finally:
        codex.ACTIVE.pop("x")
    r = client.put("/api/settings", json={"changes": {"config_dir": str(new)}, "move": True})
    assert r.status_code == 200, r.text
    assert (new / "stickers.json").exists() and (data_root / "config" / "stickers.example.json").exists()
    assert [s for s in paths.load_stickers() if s["id"] == 2][0]["zh"] == "設定頁測試"
    client.put("/api/settings", json={"changes": {"config_dir": str(data_root / "config")}, "move": True})
    (data_root / "config" / "stickers.json").unlink()   # 還原成沒有 stickers.json（test_stickers 要測 example fallback）

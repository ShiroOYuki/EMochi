"""啟動流程（lifespan）與基本 API：空的資料夾也能正常啟動"""
from fastapi.testclient import TestClient

from app.server import app


def test_startup_on_empty_data_root(data_root):
    with TestClient(app) as c:        # with 才會跑 lifespan
        assert isinstance(c.get("/api/characters").json(), list)   # 全新安裝沒有角色，也不會自動建立
        p = c.get("/api/projects").json()
        assert p["next_id"].startswith("s") and isinstance(p["projects"], list)
        assert len(c.get("/api/stickers").json()) >= 32       # 沒有 stickers.json 時用 example
        assert [g["name"] for g in c.get("/api/sticker-groups").json()][:4] == ["基礎情緒", "反應表情", "社群互動", "Twitch / 迷因"]
        assert c.get("/api/projects/nope").status_code == 404

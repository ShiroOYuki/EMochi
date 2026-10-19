"""啟動流程（lifespan）與基本 API：空的資料夾也能正常啟動"""
from fastapi.testclient import TestClient

from app.server import app


def test_startup_on_empty_data_root(data_root):
    with TestClient(app) as c:        # with 才會跑 lifespan（ensure_default 等）
        chars = c.get("/api/characters").json()
        assert len(chars) >= 1        # 沒有任何角色時會建一個預設角色
        p = c.get("/api/projects").json()
        assert p["next_id"].startswith("s") and isinstance(p["projects"], list)
        assert len(c.get("/api/stickers").json()) >= 32
        assert c.get("/api/projects/nope").status_code == 404

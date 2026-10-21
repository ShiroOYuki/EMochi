"""app/server.py _local_only：只接受本機 Host／Origin（擋 DNS rebinding、CSRF）"""

import pytest


def test_local_host_ok(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/health", headers={"host": "localhost:8765"}).status_code == 200


@pytest.mark.parametrize("host", ["evil.example.com", "evil.example.com:8765", "127.0.0.1.evil.com", ""])
def test_foreign_host_blocked(client, host):
    r = client.get("/api/health", headers={"host": host})
    assert r.status_code == 403 and r.json()["detail"] == "只接受本機的請求"


@pytest.mark.parametrize(
    "origin", ["http://127.0.0.1:8765", "http://localhost:5173", "http://LOCALHOST:38765"]
)
def test_local_origin_ok(client, origin):
    assert client.get("/api/health", headers={"origin": origin}).status_code == 200


@pytest.mark.parametrize("origin", ["https://evil.example.com", "null", "http://127.0.0.1.evil.com"])
def test_foreign_origin_blocked(client, origin):
    # 沒有 body 的 POST（例如 Codex 登入）最容易被別的網站觸發
    r = client.post("/api/codex-login", headers={"origin": origin})
    assert r.status_code == 403

"""角色庫 → 垃圾桶：刪除、列出、還原、永久刪除；刪過的編號不重用"""

import base64
import io

from PIL import Image


def _data_url() -> str:
    buf = io.BytesIO()
    Image.new("RGBA", (64, 64), (200, 100, 50, 255)).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _create(client, name):
    r = client.post(
        "/api/characters", json={"name": name, "images": [{"name": "a.png", "data": _data_url()}]}
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_character_trash_lifecycle(client):
    cid = _create(client, "測試角色")
    assert cid in [c["id"] for c in client.get("/api/characters").json()]

    assert client.delete(f"/api/characters/{cid}").json() == {"ok": True}
    assert cid not in [c["id"] for c in client.get("/api/characters").json()]
    items = client.get("/api/trash/characters").json()
    entry = next(i for i in items if i["id"] == cid)
    assert entry["restorable"] and entry["thumb"]

    # 還原
    assert client.post(f"/api/trash/characters/{entry['name']}/restore").json() == {"id": cid}
    assert cid in [c["id"] for c in client.get("/api/characters").json()]

    # 再刪、永久刪除
    client.delete(f"/api/characters/{cid}")
    entry = next(i for i in client.get("/api/trash/characters").json() if i["id"] == cid)
    assert client.delete(f"/api/trash/characters/{entry['name']}").json() == {"deleted": 1}
    assert all(i["id"] != cid for i in client.get("/api/trash/characters").json())

    # 永久刪除過的編號不會再用
    new = _create(client, "下一個角色")
    assert new != cid


def test_trash_errors(client):
    assert client.get("/api/trash/bogus").status_code == 404
    assert client.post("/api/trash/characters/nope_20200101_000000/restore").status_code == 404
    assert client.delete("/api/characters/zzz").status_code == 404
    assert client.post("/api/characters", json={"name": "  "}).status_code == 400

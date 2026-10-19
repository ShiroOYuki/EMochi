"""表情增刪改與分組（config/sticker_groups.json）"""


def test_legacy_groups(client):
    groups = client.get("/api/sticker-groups").json()
    names = [g["name"] for g in groups]
    assert names[:4] == ["基礎情緒", "反應表情", "社群互動", "Twitch / 迷因"]
    assert all(g["default"] for g in groups[:4])
    assert sum(len(g["ids"]) for g in groups[:4]) == 32


def test_crud(client):
    r = client.post("/api/stickers", json={"label": "Sleepy Tea", "zh": "打瞌睡", "prompt": "sleepy, holding tea"})
    assert r.status_code == 200
    s = r.json()
    sid = s["id"]
    assert s["name"] == "sleepy_tea"

    r = client.patch(f"/api/stickers/{sid}", json={"label": "Sleepy", "prompt_no_ears": "sleepy, no ears", "align": "bottom"})
    s = r.json()
    assert s["label"] == "Sleepy" and s["name"] == "sleepy_tea"   # 檔名不跟著改
    assert s["prompt_no_ears"] == "sleepy, no ears" and s["align"] == "bottom"
    s = client.patch(f"/api/stickers/{sid}", json={"align": None, "prompt_no_ears": ""}).json()
    assert "align" not in s and "prompt_no_ears" not in s
    assert client.patch(f"/api/stickers/{sid}", json={"prompt": "  "}).status_code == 400
    assert client.patch(f"/api/stickers/{sid}", json={"align": "top"}).status_code == 400
    assert client.patch("/api/stickers/99999", json={"zh": "x"}).status_code == 404

    # 放進分組 → 刪除 → 從分組拿掉、清單看不到、id 不重用
    groups = client.get("/api/sticker-groups").json()
    groups[0]["ids"].append(sid)
    assert client.put("/api/sticker-groups", json=groups).status_code == 200
    assert client.delete(f"/api/stickers/{sid}").status_code == 200
    assert sid not in [x["id"] for x in client.get("/api/stickers").json()]
    assert sid in [x["id"] for x in client.get("/api/stickers?all=1").json()]
    assert sid not in client.get("/api/sticker-groups").json()[0]["ids"]
    assert client.patch(f"/api/stickers/{sid}", json={"zh": "x"}).status_code == 400
    nxt = client.post("/api/stickers", json={"label": "Next", "prompt": "next"}).json()
    assert nxt["id"] == sid + 1

    assert client.post(f"/api/stickers/{sid}/restore").status_code == 200
    assert sid in [x["id"] for x in client.get("/api/stickers").json()]


def test_groups_save(client):
    s = client.post("/api/stickers", json={"label": "Grouped", "prompt": "grouped"}).json()
    groups = client.get("/api/sticker-groups").json()
    groups.append({"id": 0, "name": "  常用  ", "ids": [1, 1, s["id"], 2], "default": False})
    out = client.put("/api/sticker-groups", json=groups).json()
    g = out[-1]
    assert g["name"] == "常用" and g["ids"] == [1, s["id"], 2]
    assert g["id"] > max(x["id"] for x in out[:-1])

    # 一個表情可以在好幾組；分組名稱不能空白；不存在的表情擋掉
    assert 1 in out[0]["ids"] and 1 in g["ids"]
    bad = out + [{"name": " ", "ids": []}]
    assert client.put("/api/sticker-groups", json=bad).status_code == 400
    bad = out + [{"name": "x", "ids": [99999]}]
    assert client.put("/api/sticker-groups", json=bad).status_code == 400

    # 新增時直接放進分組
    t = client.post("/api/stickers", json={"label": "Into", "prompt": "into", "group_id": g["id"]}).json()
    assert t["id"] in client.get("/api/sticker-groups").json()[-1]["ids"]

    # 刪掉分組不影響表情
    assert client.put("/api/sticker-groups", json=out[:-1]).status_code == 200
    assert s["id"] in [x["id"] for x in client.get("/api/stickers").json()]

"""表情增刪改與分組（config/sticker_groups.json）"""


def test_example_fallback(client, data_root):
    """還沒有 stickers.json 時用 example；第一次修改才寫出 stickers.json，example 不動"""
    cfg = data_root / "config"
    assert not (cfg / "stickers.json").exists()
    assert len(client.get("/api/stickers").json()) == 32
    client.patch("/api/stickers/1", json={"zh": "改過"})
    assert (cfg / "stickers.json").exists()
    import json

    ex = json.loads((cfg / "stickers.example.json").read_text(encoding="utf-8"))
    assert ex[0]["zh"] != "改過"


def test_default_groups(client):
    """沒有 sticker_groups.json 時用 sticker_groups.example.json"""
    groups = client.get("/api/sticker-groups").json()
    names = [g["name"] for g in groups]
    assert names[:4] == ["基礎情緒", "反應表情", "社群互動", "Twitch / 迷因"]
    assert all(g["default"] for g in groups[:4])
    assert sum(len(g["ids"]) for g in groups[:4]) == 32


def test_crud(client):
    r = client.post(
        "/api/stickers", json={"label": "Sleepy Tea", "zh": "打瞌睡", "prompt": "sleepy, holding tea"}
    )
    assert r.status_code == 200
    s = r.json()
    sid = s["id"]
    assert s["name"] == "sleepy_tea"

    r = client.patch(
        f"/api/stickers/{sid}",
        json={"label": "Sleepy", "prompt_no_ears": "sleepy, no ears", "align": "bottom"},
    )
    s = r.json()
    assert s["label"] == "Sleepy" and s["name"] == "sleepy_tea"  # 檔名不跟著改
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
    assert client.patch(f"/api/stickers/{sid}", json={"zh": "x"}).status_code == 409
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


def test_expand(client, monkeypatch):
    """擴寫：不真的呼叫 Codex，檢查 prompt 內容與回傳整理"""
    import json

    from app import codex

    seen = {}

    def fake(prompt, schema, log, **kw):
        seen["prompt"] = prompt
        seen["schema"] = json.loads(schema.read_text(encoding="utf-8"))
        return json.dumps(
            {
                "label": " Sleepy Tea ",
                "zh": "捧茶打瞌睡、眼皮下垂",
                "prompt": "dozing off, holding a teacup",
                "prompt_no_ears": "",
                "align": "center",
            }
        )

    monkeypatch.setattr(codex, "run_text", fake)
    r = client.post("/api/stickers/expand", json={"idea": "捧著茶杯打瞌睡"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d == {
        "label": "Sleepy Tea",
        "zh": "捧茶打瞌睡、眼皮下垂",
        "prompt": "dozing off, holding a teacup",
        "prompt_no_ears": "",
        "align": None,
    }
    assert "捧著茶杯打瞌睡" in seen["prompt"] and "beaming happy smile" in seen["prompt"]  # 有附現有範例
    assert "prompt_no_ears" in seen["prompt"] and seen["schema"]["required"]
    # 沒寫想法時用中文說明；都沒有就擋
    assert client.post("/api/stickers/expand", json={"zh": "生氣跺腳"}).status_code == 200
    assert "生氣跺腳" in seen["prompt"]
    assert client.post("/api/stickers/expand", json={}).status_code == 400


def _png_data_url(color=(255, 120, 160)) -> str:
    import base64
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGBA", (64, 64), color).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_analyze_with_image(client, monkeypatch, data_root):
    """表情分析：範例圖交給 Codex 看（images 參數），不寫想法也可以；不會存進表情"""
    import json

    from app import codex

    seen = {}

    def fake(prompt, schema, log, **kw):
        seen.update(prompt=prompt, images=kw.get("images"), log=log)
        return json.dumps(
            {
                "label": "Peek",
                "zh": "從下方探頭",
                "prompt": "peeking up",
                "prompt_no_ears": "",
                "align": "bottom",
            }
        )

    monkeypatch.setattr(codex, "run_text", fake)
    r = client.post("/api/stickers/analyze", json={"image": {"name": "a.png", "data": _png_data_url()}})
    assert r.status_code == 200, r.text
    assert r.json()["align"] == "bottom"
    assert seen["images"] and seen["images"][0].endswith("analyze_input.png")
    assert seen["images"][0] in seen["prompt"] and "example emote image" in seen["prompt"]
    assert "analyze" in seen["log"].name
    assert not any(s.get("example") for s in client.get("/api/stickers").json())
    bad = client.post(
        "/api/stickers/analyze", json={"image": {"name": "a.png", "data": "data:image/png;base64,AAAA"}}
    )
    assert bad.status_code == 400


def test_example_image(client, data_root):
    """範例圖：存、換、拿掉（移到 _removed），編輯描述不會弄丟"""
    s = client.post("/api/stickers", json={"label": "Example Pic", "prompt": "waving"}).json()
    r = client.put(f"/api/stickers/{s['id']}/example", json={"name": "x.png", "data": _png_data_url()})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["example"] == f"{s['id']}.png" and d["example_v"] > 0
    assert client.get(f"/files/sticker_examples/{d['example']}").status_code == 200
    client.patch(f"/api/stickers/{s['id']}", json={"zh": "揮手"})
    again = next(x for x in client.get("/api/stickers").json() if x["id"] == s["id"])
    assert again["example"] == d["example"]
    gone = client.delete(f"/api/stickers/{s['id']}/example").json()
    assert "example" not in gone
    assert (data_root / "config" / "sticker_examples" / "_removed" / d["example"]).exists()
    assert client.put("/api/stickers/99999/example", json={"data": _png_data_url()}).status_code == 404


def test_thumbs(client, data_root):
    """縮圖：範例圖優先；沒有就用最新成品（優先 Twitch 112）；都沒有不列"""
    import os

    from PIL import Image

    def png(p, mtime):
        p.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (8, 8), (1, 2, 3, 255)).save(p)
        os.utime(p, (mtime, mtime))

    T = 4_000_000_000  # 比其他測試生成的檔案都新
    old = data_root / "outputs" / "t_old" / "final"
    new = data_root / "outputs" / "t_new" / "final"
    png(old / "master" / "01_happy.png", T + 1_000)
    png(new / "master" / "01_happy.png", T + 2_000)
    png(new / "twitch" / "112" / "01_happy.png", T + 2_000)
    png(old / "master" / "03_cry.png", T + 1_500)
    fresh = client.post("/api/stickers", json={"label": "No Thumb Yet", "prompt": "x"}).json()
    by_id = {t["id"]: t for t in client.get("/api/stickers/thumbs").json()}
    assert by_id[1] == {
        "id": 1,
        "kind": "latest",
        "path": "outputs/t_new/final/twitch/112/01_happy.png",
        "v": T + 2000,
    }
    assert by_id[3]["path"] == "outputs/t_old/final/master/03_cry.png"
    assert fresh["id"] not in by_id
    client.put("/api/stickers/3/example", json={"data": _png_data_url()})
    by_id = {t["id"]: t for t in client.get("/api/stickers/thumbs").json()}
    assert by_id[3]["kind"] == "example" and by_id[3]["path"] == "sticker_examples/3.png"
    assert client.get(f"/files/{by_id[1]['path']}").status_code == 200

"""Gallery：掃描成品、匯出 zip（含規格檢查結果）、勾選清單"""

import io
import json
import zipfile

from PIL import Image

STYLE = "s7"


def _make_finals(data_root):
    final = data_root / "outputs" / STYLE / "final"
    for sub, size, name in [
        ("master", 512, "01_happy.png"),
        ("twitch/112", 112, "01_happy.png"),
        ("twitch/56", 60, "01_happy.png"),  # 故意做錯尺寸
        ("twitch/28", 28, "01_happy.png"),
        ("discord", 128, "happy.png"),
    ]:
        (final / sub).mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (size, size), (255, 128, 0, 255)).save(final / sub / name)


def test_scan_lists_finished_stickers(client, data_root):
    _make_finals(data_root)
    styles = client.get("/api/gallery").json()
    s = next(s for s in styles if s["id"] == STYLE)
    it = s["items"][0]
    assert (it["id"], it["name"], it["label"]) == (1, "happy", "Happy")
    assert set(it["files"]) == {"master", "t112", "t56", "t28", "discord"}


def test_export_zip_and_spec_issues(client, data_root):
    _make_finals(data_root)
    r = client.post(
        "/api/gallery/export",
        json={"keys": [f"{STYLE}:1"], "formats": ["t112", "t56", "discord"], "tag": "v1"},
    )
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["count"] == 3
    assert res["file"].endswith("_v1.zip")
    # 舊版格式代號（formats）照樣能用；56 那張後處理檔案尺寸錯 → 改用母版重縮，並列在 issues
    assert [i["file"] for i in res["issues"]] == [f"{STYLE}/twitch/56/01_happy_{STYLE}_v1.png"]
    with zipfile.ZipFile(io.BytesIO((data_root / "exports" / res["file"]).read_bytes())) as z:
        names = sorted(z.namelist())
        fixed = Image.open(io.BytesIO(z.read(f"{STYLE}/twitch/56/01_happy_{STYLE}_v1.png"))).size
    assert fixed == (56, 56)
    assert names == sorted(
        [
            f"{STYLE}/twitch/112/01_happy_{STYLE}_v1.png",
            f"{STYLE}/twitch/56/01_happy_{STYLE}_v1.png",
            f"{STYLE}/discord/01_happy_{STYLE}_v1.png",
        ]
    )
    doc = json.loads((data_root / "exports" / res["file"].replace("_v1.zip", ".json")).read_text("utf-8"))
    assert doc["zip"] == res["file"] and doc["issues"]


def test_selection_roundtrip(client, data_root):
    _make_finals(data_root)
    r = client.post("/api/gallery/selections", json={"keys": [f"{STYLE}:1", f"{STYLE}:99"]})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 1  # 不存在的 99 會被略過
    names = [s["file"] for s in client.get("/api/gallery/selections").json()]
    assert r.json()["file"] in names

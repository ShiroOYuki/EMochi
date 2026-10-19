"""匯出預設集：讀寫驗證、各種縮放方式、大小上限、序號檔名、自訂單次尺寸"""
import io
import zipfile

import pytest
from PIL import Image

from test_gallery import STYLE, _make_finals


@pytest.fixture
def clean(data_root):
    yield
    for n in ("export_presets.json", "export_presets.json.bak"):
        f = data_root / "config" / n
        if f.exists():
            f.unlink()


def _zip(data_root, res):
    with zipfile.ZipFile(io.BytesIO((data_root / "exports" / res["file"]).read_bytes())) as z:
        return {n: Image.open(io.BytesIO(z.read(n))).size for n in z.namelist()}, {n: len(z.read(n)) for n in z.namelist()}


def test_builtin_and_crud(client, clean):
    d = client.get("/api/export-presets").json()
    ids = [p["id"] for p in d["presets"]]
    assert d["custom"] is False and {"twitch", "discord", "line_sticker", "telegram", "master"} <= set(ids)
    mine = {"name": "我的 300", "sizes": [{"w": 300, "h": 300}], "max_kb": 200}
    r = client.put("/api/export-presets", json={"presets": [*d["presets"], mine]})
    assert r.status_code == 200, r.text
    p = r.json()["presets"][-1]
    assert p["id"] and p["folder"] == p["id"] and p["mode"] == "fit" and p["max_kb"] == 200 and p["group"] == ""
    assert {x["group"] for x in d["presets"]} >= {"Twitch", "Discord", "LINE"}   # 內建的都有分組
    assert client.get("/api/export-presets").json()["custom"] is True
    # 驗證：沒名稱、沒尺寸、太大、資料夾重複
    bad = [{"name": "", "sizes": [{"w": 64}]}, {"name": "x", "sizes": []}, {"name": "x", "sizes": [{"w": 99999}]}]
    for b in bad:
        assert client.put("/api/export-presets", json={"presets": [b]}).status_code == 400
    dup = [{"name": "a", "folder": "same", "sizes": [{"w": 64}]}, {"name": "b", "folder": "same", "sizes": [{"w": 64}]}]
    assert "重複" in client.put("/api/export-presets", json={"presets": dup}).json()["detail"]
    # 還原內建
    r = client.post("/api/export-presets/reset").json()
    assert r["custom"] is False and [p["id"] for p in r["presets"]] == ids


def test_render_modes():
    from app import presets
    master = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
    fit = presets.render(master, {"w": 370, "h": 320}, "fit", 10, True)
    assert fit.size == (320, 320)
    assert fit.getpixel((5, 5))[3] == 0 and fit.getpixel((160, 160))[3] == 255   # 四周 10px 透明
    canvas = presets.render(master, {"w": 96, "h": 74}, "canvas", 2, True)
    assert canvas.size == (96, 74)
    assert canvas.getpixel((2, 37))[3] == 0 and canvas.getpixel((48, 37))[3] == 255   # 左右補透明
    odd = presets.out_size({"w": 101, "h": 101}, "fit", True)
    assert odd == (100, 100)


def test_export_presets_and_custom(client, data_root, clean):
    _make_finals(data_root)
    res = client.post("/api/gallery/export", json={
        "keys": [f"{STYLE}:1"], "presets": ["twitch", "line_sticker", "line_tab"],
        "custom": {"sizes": [{"w": 300, "h": 200}], "mode": "canvas"}}).json()
    sizes, _ = _zip(data_root, res)
    assert sizes[f"{STYLE}/twitch/112/01_happy_{STYLE}.png"] == (112, 112)      # 沿用後處理的檔案
    assert sizes[f"{STYLE}/twitch/56/01_happy_{STYLE}.png"] == (56, 56)         # 後處理的錯了 → 母版重縮
    assert sizes[f"{STYLE}/line_sticker/01.png"] == (320, 320)                 # LINE：序號檔名、偶數、留白
    assert sizes[f"{STYLE}/line_tab/01_happy_{STYLE}.png"] == (96, 74)
    assert sizes[f"{STYLE}/custom/01_happy_{STYLE}.png"] == (300, 200)           # 自訂只用這次
    assert "custom" not in [p["id"] for p in client.get("/api/export-presets").json()["presets"]]
    assert client.post("/api/gallery/export", json={"keys": [f"{STYLE}:1"]}).status_code == 400


def test_max_kb_compresses(client, data_root, clean):
    """雜訊大圖一定超過 25 KB：降色後仍超過 → 照樣放進 zip 並在 issues 說明"""
    import random
    _make_finals(data_root)
    master = data_root / "outputs" / STYLE / "final" / "master" / "01_happy.png"
    rnd = random.Random(1)
    im = Image.new("RGBA", (512, 512))
    im.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256), 255) for _ in range(512 * 512)])
    im.save(master)
    res = client.post("/api/gallery/export", json={"keys": [f"{STYLE}:1"], "custom": {"sizes": [{"w": 400}], "max_kb": 25}}).json()
    assert res["issues"] and "上限 25" in res["issues"][0]["notes"][0]
    _make_finals(data_root)   # 還原，給其他測試用


def test_old_file_without_group_gets_builtin_group(client, data_root, clean):
    """2026-10-20 前存的 export_presets.json 沒有 group：內建的那幾組自動補上分組，自己新增的留空"""
    import json
    (data_root / "config" / "export_presets.json").write_text(json.dumps([
        {"id": "line_sticker", "name": "LINE 貼圖", "sizes": [{"w": 370, "h": 320}]},
        {"id": "mine", "name": "我的", "sizes": [{"w": 64, "h": 64}]}]), encoding="utf-8")
    got = {p["id"]: p["group"] for p in client.get("/api/export-presets").json()["presets"]}
    assert got == {"line_sticker": "LINE", "mine": ""}

"""角色庫、畫風庫共用的儲存（reflib.RefLibrary）：id、標準檔名、流水號只增不減、刪除進垃圾桶"""
import io

from PIL import Image


def _png(color=(255, 0, 0)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, "PNG")
    return buf.getvalue()


def test_character_images_and_numbering():
    from app import characters
    c = characters.create("測試角色", [("a.jpg", _png()), ("b.png", _png((0, 0, 255)))])
    cid = c["id"]
    assert [i["file"] for i in c["images"]] == ["ref_01.png", "ref_02.png"]
    assert [i["source"] for i in c["images"]] == ["a.jpg", "b.png"]
    c = characters.remove_image(cid, "ref_02.png")
    c = characters.add_images(cid, [("c.png", _png())])
    assert [i["file"] for i in c["images"]] == ["ref_01.png", "ref_03.png"]   # 不沿用 02
    c = characters.update(cid, {"use": {"ref_01.png": False}, "name": "改名"})
    assert c["name"] == "改名" and [i["use"] for i in c["images"]] == [False, True]
    assert characters.rel_paths(cid)[0].endswith("ref_03.png")
    characters.delete(cid)
    assert characters.get(cid) is None
    nxt = characters.create("下一個", [])
    assert nxt["id"] != cid   # 垃圾桶裡的 id 不會被拿走
    characters.delete(nxt["id"])


def test_style_lib_shares_rules():
    import pytest
    from app import style_lib
    s = style_lib.create("測試畫風", [("x.png", _png())])
    assert s["id"].startswith("st") and s["images"][0]["file"] == "ref_01.png"
    s = style_lib.update(s["id"], {"framing": "whole", "use": {"ref_01.png": False}})
    assert s["framing"] == "whole" and s["images"][0]["use"] is False
    assert style_lib.rel_paths(s["id"]) == [] and len(style_lib.rel_paths(s["id"], used_only=False)) == 1
    assert any(x["id"] == s["id"] for x in style_lib.list_all())
    style_lib.delete(s["id"])
    with pytest.raises(KeyError):
        style_lib.update(s["id"], {"name": "x"})

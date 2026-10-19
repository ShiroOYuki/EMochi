"""/files/：快取標頭、ETag 304、不能讀到允許範圍以外的檔案"""
from PIL import Image


def _png(data_root, rel="outputs/s9/final/master/01_happy.png"):
    p = data_root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (16, 16), (255, 0, 0, 255)).save(p)
    return rel


def test_versioned_url_is_long_cached(client, data_root):
    rel = _png(data_root)
    r = client.get(f"/files/{rel}?v=123")
    assert r.status_code == 200
    assert "immutable" in r.headers["cache-control"]
    assert r.headers["etag"]


def test_unversioned_url_revalidates_and_returns_304(client, data_root):
    rel = _png(data_root)
    r = client.get(f"/files/{rel}")
    assert r.headers["cache-control"] == "no-cache"
    etag = r.headers["etag"]
    r2 = client.get(f"/files/{rel}", headers={"If-None-Match": etag})
    assert r2.status_code == 304
    assert r2.content == b""


def test_changed_file_gets_new_etag(client, data_root):
    rel = _png(data_root, "outputs/s9/final/master/02_lol.png")
    e1 = client.get(f"/files/{rel}").headers["etag"]
    Image.new("RGBA", (32, 32), (0, 0, 255, 255)).save(data_root / rel)
    r = client.get(f"/files/{rel}", headers={"If-None-Match": e1})
    assert r.status_code == 200
    assert r.headers["etag"] != e1


def test_outside_allowed_dirs_is_404(client, data_root):
    assert client.get("/files/config/stickers.json").status_code == 404
    assert client.get("/files/outputs/../config/stickers.json").status_code == 404
    assert client.get("/files/outputs/nope.png").status_code == 404


def test_zip_is_not_cached(client, data_root):
    z = data_root / "exports" / "x.zip"
    z.parent.mkdir(parents=True, exist_ok=True)
    z.write_bytes(b"PK\x05\x06" + b"\0" * 18)
    r = client.get("/files/exports/x.zip")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"

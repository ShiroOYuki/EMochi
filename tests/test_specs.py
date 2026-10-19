"""specs.fit：平台尺寸、大小上限檢查與壓縮"""
import io

import numpy as np
from PIL import Image

from app import specs


def _bytes(im: Image.Image, **kw) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", **kw)
    return buf.getvalue()


def test_small_correct_file_passes_untouched():
    data = _bytes(Image.new("RGBA", (112, 112), (255, 0, 0, 255)))
    out, notes = specs.fit(data, "t112")
    assert out == data and notes == []


def test_wrong_size_only_warns():
    data = _bytes(Image.new("RGBA", (100, 112)))
    out, notes = specs.fit(data, "t112")
    assert out == data
    assert len(notes) == 1 and "112×112" in notes[0]


def test_oversize_discord_gets_compressed_under_limit():
    # 平滑漸層、不壓縮存檔 → 遠超過 256 KB，但無損重壓就能壓下來
    x = np.linspace(0, 255, 400, dtype=np.uint8)
    arr = np.zeros((400, 400, 4), dtype=np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 3] = x[None, :], x[:, None], 255
    data = _bytes(Image.fromarray(arr, "RGBA"), compress_level=0)
    assert len(data) > specs.SPECS["discord"].max_bytes
    out, notes = specs.fit(data, "discord")
    assert notes and "已" in notes[-1]
    assert len(out) <= specs.SPECS["discord"].max_bytes
    Image.open(io.BytesIO(out)).load()   # 壓完還是合法 PNG


def test_incompressible_file_asks_for_manual_fix():
    rng = np.random.default_rng(0)
    arr = rng.integers(0, 256, (600, 600, 4), dtype=np.uint8)
    data = _bytes(Image.fromarray(arr, "RGBA"))
    out, notes = specs.fit(data, "discord")
    assert out == data or len(out) <= specs.SPECS["discord"].max_bytes
    if out == data:
        assert "請手動處理" in notes[-1]


def test_master_and_unknown_format_are_not_checked():
    data = _bytes(Image.new("RGBA", (512, 512)))
    assert specs.fit(data, "master") == (data, [])
    assert specs.fit(data, "whatever") == (data, [])

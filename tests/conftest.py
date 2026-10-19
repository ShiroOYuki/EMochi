"""測試共用設定

所有資料（outputs/、characters/、exports/…）都寫到暫存資料夾：
在 import app 之前設好 EMOCHI_ROOT，app/paths.py 就會把資料根目錄指過去，不會動到真正的專案資料。
"""
import os
import shutil
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
DATA = Path(tempfile.mkdtemp(prefix="emochi_test_"))
(DATA / "config").mkdir()
# 只放 example：順便測到「沒有 stickers.json 時讀 stickers.example.json」
for name in ("prompt_template.json", "stickers.example.json", "sticker_groups.example.json"):
    shutil.copy(REPO / "config" / name, DATA / "config" / name)
os.environ["EMOCHI_ROOT"] = str(DATA)

from PIL import Image, ImageDraw  # noqa: E402

GREEN = (0, 255, 0)


def make_grid(path: Path, cols: int = 3, rows: int = 2, cell: int = 512, empty=frozenset()) -> Path:
    """純綠底網格，每格中間畫一顆有顏色的圓（模擬角色）；empty 裡的格子留空"""
    im = Image.new("RGB", (cols * cell, rows * cell), GREEN)
    d = ImageDraw.Draw(im)
    for i in range(cols * rows):
        if i in empty:
            continue
        r, c = divmod(i, cols)
        cx, cy = c * cell + cell // 2, r * cell + cell // 2
        rad = cell // 4 + i * 6
        d.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(240, 200, 220), outline=(60, 40, 70), width=6)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    return path


@pytest.fixture(scope="session")
def data_root() -> Path:
    return DATA


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.server import app
    return TestClient(app)


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(DATA, ignore_errors=True)

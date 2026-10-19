"""網格切割：3×2 合成網格 → 6 格去背；空格回傳 None；process_grid 輸出各尺寸"""
import numpy as np
from PIL import Image

from app import pipeline
from conftest import make_grid

PROCESS = {"tol": 70, "soft": 60, "choke": 1, "min_blob": 0.0003, "square": None, "margin": 0.04}


def test_cut_cells_3x2(data_root):
    grid = make_grid(data_root / "tmp" / "grid32.png")
    cells = pipeline.cut_cells(grid, "3x2", PROCESS)
    assert len(cells) == 6
    for img in cells:
        a = np.asarray(img)
        assert img.mode == "RGBA"
        # 綠底被去掉：裁切後四個角是透明的，中間不透明
        assert a[0, 0, 3] == 0 and a[-1, -1, 3] == 0
        assert a[a.shape[0] // 2, a.shape[1] // 2, 3] == 255
        # 不留綠邊
        opaque = a[a[..., 3] > 200]
        assert not ((opaque[:, 1] > 200) & (opaque[:, 0] < 80) & (opaque[:, 2] < 80)).any()


def test_square_mode_keeps_same_box_and_empty_cell(data_root):
    grid = make_grid(data_root / "tmp" / "grid_sq.png", empty={4})
    cells = pipeline.cut_cells(grid, "3x2", {**PROCESS, "square": 0.5})
    assert cells[4] is None
    sizes = {c.size for c in cells if c is not None}
    assert len(sizes) == 1
    w, h = next(iter(sizes))
    assert w == h


def test_process_grid_writes_all_sizes(data_root):
    grid = make_grid(data_root / "tmp" / "grid_out.png", empty={5})
    done = pipeline.process_grid("s8", grid, "3x2", [1, 2, 3, 4, 5, 6], PROCESS)
    assert done == [1, 2, 3, 4, 5]
    final = data_root / "outputs" / "s8" / "final"
    for folder, size in pipeline.SIZES.items():
        name = "happy.png" if folder == "discord" else "01_happy.png"
        assert Image.open(final / folder / name).size == (size, size)

"""網格圖 → 成品（依「每一格對應哪個貼圖 ID」切割，不再假設編號連續）

沿用 tools/postprocess.py 的去背、去雜點、裁切函式，輸出結構與既有畫風一致：
  outputs/<style>/final/master/NN_name.png        512
  outputs/<style>/final/twitch/{112,56,28}/NN_name.png
  outputs/<style>/final/discord/name.png          128
  outputs/<style>/previews/<style>_preview.png、<style>_all_discord.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from .paths import OUTPUTS, ROOT, sticker_map
from .prompts import LAYOUTS

sys.path.insert(0, str(ROOT / "tools"))
import postprocess as pp  # noqa: E402

SIZES = {"master": 512, "twitch/112": 112, "twitch/56": 56, "twitch/28": 28, "discord": 128}


def file_name(sid: int, name: str, folder: str) -> str:
    return f"{name}.png" if folder == "discord" else f"{sid:02d}_{name}.png"


def _bbox(img: Image.Image) -> tuple[int, int, int, int] | None:
    a = np.asarray(img)[..., 3]
    ys, xs = np.where(a > 8)
    return None if len(xs) == 0 else (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def cut_cells(grid_path: Path, layout: str, process: dict) -> list[Image.Image | None]:
    """回傳每一格去背、裁切後的 RGBA（空格回傳 None）

    特寫（process.square 不是 None）：同一張網格的每一格用「同樣大小」的正方形框去裁，
    框的邊長＝這張網格裡角色寬度的中位數。之後每張都縮到 512，所以整組貼圖的縮放倍率一致——
    旁邊多畫了愛心、問號、手的那張，臉不會因為外框變大而被縮小。
    整顆入鏡（square 是 None）：維持每張各自裁到內容外框。"""
    L = LAYOUTS[layout]
    full = np.array(Image.open(grid_path).convert("RGB"))
    key = pp.detect_key(full)
    H, W = full.shape[:2]
    cells = []
    for r in range(L["rows"]):
        for c in range(L["cols"]):
            x0, x1 = round(c * W / L["cols"]), round((c + 1) * W / L["cols"])
            y0, y1 = round(r * H / L["rows"]), round((r + 1) * H / L["rows"])
            rgba = pp.key_out(full[y0:y1, x0:x1], key, process.get("tol", 70), process.get("soft", 60))
            rgba = pp.choke(rgba, process.get("choke", 1))
            rgba = pp.drop_specks(rgba, process.get("min_blob", 0.0003))
            cells.append(Image.fromarray(rgba, "RGBA"))

    top_ratio = process.get("square")
    if top_ratio is None:
        return [pp.trim(img) for img in cells]

    boxes = [_bbox(img) for img in cells]
    widths = sorted(b[2] - b[0] for b in boxes if b)
    if not widths:
        return [None] * len(cells)
    cell_w = min(img.width for img in cells)
    side = min(widths[len(widths) // 2], cell_w)
    out = []
    for img, b in zip(cells, boxes):
        if b is None:
            out.append(None)
            continue
        bx0, by0, bx1, by1 = b
        left = round((bx0 + bx1) / 2 - side / 2)
        extra = (by1 - by0) - side
        # 比框高：依 square（上方比例）分配要裁掉的上下高度；比框矮（例如 lurk 只露半顆頭）：貼齊底部
        top = by0 + round(extra * min(max(top_ratio, 0), 1)) if extra > 0 else by1 - side
        out.append(img.crop((left, top, left + side, top + side)))   # 超出格子的部分 PIL 會補透明
    return out


def write_sticker(style: str, sid: int, img: Image.Image, process: dict, meta: dict) -> None:
    final = OUTPUTS / style / "final"
    bottom = meta.get("align") == "bottom" or meta.get("name") == "lurk"
    margin = 0 if bottom else process.get("margin", 0)
    for folder, size in SIZES.items():
        d = final / folder
        d.mkdir(parents=True, exist_ok=True)
        canvas = pp._fit(img, size, size, margin, "bottom" if bottom else "center", flush_bottom=bottom)
        canvas.save(d / file_name(sid, meta["name"], folder), optimize=True)


def process_grid(style: str, grid_path: Path, layout: str, ids: list[int], process: dict) -> list[int]:
    """處理一張網格，回傳成功輸出的貼圖 ID"""
    meta = sticker_map()
    cells = cut_cells(grid_path, layout, process)
    done = []
    for sid, img in zip(ids, cells):
        if img is None or sid not in meta:
            continue
        write_sticker(style, sid, img, process, meta[sid])
        done.append(sid)
    return done


def build_previews(style: str) -> None:
    final = OUTPUTS / style / "final"
    prev = OUTPUTS / style / "previews"
    prev.mkdir(parents=True, exist_ok=True)
    masters = sorted((final / "master").glob("*.png"))
    if not masters:
        return
    per_row, tile = 8, 160
    rows = (len(masters) + per_row - 1) // per_row
    sheet = pp.checker(per_row * tile, rows * tile)
    for i, f in enumerate(masters):
        sheet.alpha_composite(Image.open(f).resize((tile, tile), Image.LANCZOS),
                              ((i % per_row) * tile, (i // per_row) * tile))
    sheet.convert("RGB").save(prev / f"{style}_preview.png")
    im = Image.new("RGB", (8 * 122 + 20 + 8 * 64 + 20 + 8 * 36 + 30, rows * 125 + 20), (49, 51, 56))
    for i, f in enumerate(masters):
        r, c = divmod(i, per_row)
        y = 10 + r * 125
        for sz, x0, step in [(112, 10, 122), (56, 1006, 64), (28, 1538, 36)]:
            p = final / f"twitch/{sz}" / f.name
            if p.exists():
                t = Image.open(p)
                im.paste(t, (x0 + c * step, y + (112 - sz) // 2), t)
    im.save(prev / f"{style}_all_discord.png")

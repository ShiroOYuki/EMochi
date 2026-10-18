#!/usr/bin/env python3
"""
貼圖後處理：網格切割 → 去背 → 去雜點 → 裁邊 → 等比縮放置中 → 輸出多種尺寸

用法：
  python postprocess.py group1.png group2.png group3.png group4.png
  python postprocess.py single_14.png --grid 1x1 --start 14
  python postprocess.py group*.png --sizes 370x320 --margin 0.03
  python postprocess.py group1.png --head 0.7      # 只保留上方 70%（裁掉袖子/身體），頭部放大
  python postprocess.py group1_closeup.png --square 0.5 --margin 0   # 特寫版：直式格子裁成正方形、貼滿畫布

依賴：pip install pillow numpy scipy   （選用：pip install rembg  搭配 --rembg）
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


# ---------- 參數 ----------

def parse_size(s):
    s = s.strip().lower()
    if "x" in s:
        w, h = s.split("x")
        return int(w), int(h)
    return int(s), int(s)


def parse_args():
    p = argparse.ArgumentParser(description="貼圖網格切割與後處理")
    p.add_argument("inputs", nargs="+", help="網格圖或單張圖，依序處理")
    p.add_argument("--grid", default="4x2", help="欄x列，預設 4x2；單張圖用 1x1")
    p.add_argument("--start", type=int, default=1, help="第一格對應的貼圖編號，預設 1")
    p.add_argument("--sizes", default="112,56,28",
                   help="輸出尺寸，逗號分隔，可寫 112 或 370x320。預設 Twitch 112,56,28")
    p.add_argument("--master", type=int, default=512, help="高解析母版邊長，0 表示不輸出")
    p.add_argument("--margin", type=float, default=0.04, help="四周留白比例，預設 0.04")
    p.add_argument("--key", default="auto",
                   help="背景色：auto（取邊緣中位數）或 #RRGGBB")
    p.add_argument("--tol", type=float, default=70, help="去背容差下限（色彩距離）")
    p.add_argument("--soft", type=float, default=60, help="去背羽化寬度")
    p.add_argument("--choke", type=int, default=1,
                   help="alpha 往內收幾個像素，去掉最外圈殘留色邊，預設 1；0 = 不收")
    p.add_argument("--stroke", type=float, default=0,
                   help="外圍描邊粗細，以輸出邊長的比例表示（例 0.02 = 112px 時約 2px）；0 = 不描邊")
    p.add_argument("--stroke-color", default="#2a2230", help="描邊顏色，預設深灰紫")
    p.add_argument("--rembg", action="store_true", help="改用 rembg 去背（需另外安裝）")
    p.add_argument("--min-blob", type=float, default=0.0015,
                   help="小於此面積比例的孤立雜點會被移除")
    p.add_argument("--align", choices=["center", "bottom"], default="center",
                   help="縮放後的對齊方式")
    p.add_argument("--head", type=float, default=0,
                   help="頭部特寫：只保留去背後主體上方這個比例（例 0.7），下緣切齊畫布底部。0 = 關閉")
    p.add_argument("--square", type=float, default=-1,
                   help="把直式主體裁成正方形；數值為從上方裁掉的比例（0=全裁下方、1=全裁上方，建議 0.7）。-1 = 關閉")
    p.add_argument("--meta", default=str(ROOT / "config" / "stickers.json"), help="貼圖設定檔")
    p.add_argument("--out", default="out", help="輸出資料夾")
    return p.parse_args()


# ---------- 去背 ----------

def hex_to_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def detect_key(rgb):
    """取整張圖外框一圈的中位數當背景色"""
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    return np.median(border, axis=0).astype(np.float32)


def is_chroma(key):
    """飽和度高的背景（綠幕、洋紅）用全域色鍵；白/灰背景改用外緣連通，避免吃掉眼白"""
    mx, mn = key.max(), key.min()
    return mx > 0 and (mx - mn) / mx > 0.5


def key_out(cell_rgb, key, tol, soft):
    rgb = cell_rgb.astype(np.float32)
    dist = np.linalg.norm(rgb - key, axis=2)
    alpha = np.clip((dist - tol) / max(soft, 1), 0, 1)

    if not is_chroma(key):
        # 只移除和圖片邊緣相連的背景區域
        near = dist < tol + soft
        labels, _ = ndimage.label(near)
        edge_ids = np.unique(np.concatenate(
            [labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
        edge_ids = edge_ids[edge_ids != 0]
        bg = np.isin(labels, edge_ids)
        alpha = np.where(bg, alpha, 1.0)

    out = rgb.copy()
    # 1) 反混色：半透明像素 = 前景*a + 背景*(1-a)，把背景成分扣掉還原前景色
    a3 = alpha[..., None]
    safe = np.maximum(a3, 1e-3)
    unmixed = (rgb - (1 - a3) * key) / safe
    out = np.where(a3 < 1, unmixed, out).clip(0, 255)
    # 2) 去溢色：所有像素一律處理（不只是半透明的），邊緣不透明但偏綠的也會被壓掉
    if key[1] > key[0] + 60 and key[1] > key[2] + 60:
        out[..., 1] = np.minimum(out[..., 1], np.maximum(out[..., 0], out[..., 2]))
    elif key[0] > key[1] + 60 and key[2] > key[1] + 60:
        lim = out[..., 1] + 40
        for c in (0, 2):
            out[..., c] = np.minimum(out[..., c], np.maximum(lim, out[..., 2 - c]))

    a = (alpha * 255).astype(np.uint8)
    return np.dstack([out.clip(0, 255).astype(np.uint8), a])


def key_out_rembg(cell_img):
    try:
        from rembg import remove
    except ImportError:
        sys.exit("找不到 rembg，請先 pip install rembg，或拿掉 --rembg")
    return np.array(remove(cell_img.convert("RGB")).convert("RGBA"))


def choke(rgba, px):
    """alpha 最小值濾波往內收 px 像素"""
    if px <= 0:
        return rgba
    rgba = rgba.copy()
    rgba[..., 3] = ndimage.minimum_filter(rgba[..., 3], size=2 * px + 1)
    return rgba


def drop_specks(rgba, min_ratio):
    """移除面積很小的孤立色塊（通常是鄰格溢出或雜點）"""
    solid = rgba[..., 3] > 16
    labels, n = ndimage.label(solid)
    if n <= 1:
        return rgba
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    min_px = max(min_ratio * solid.size, 4)
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = sizes >= min_px
    # 至少保留最大的那塊
    keep[1 + int(np.argmax(sizes))] = True
    mask = keep[labels]
    rgba = rgba.copy()
    rgba[..., 3] = np.where(mask, rgba[..., 3], 0)
    return rgba


# ---------- 排版 ----------

def trim(img):
    a = np.array(img)[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return None
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def head_crop(img, keep):
    """只保留上方 keep 比例，再重新裁左右空白（被切掉的袖子/尾巴不再撐寬）"""
    cut = max(1, round(img.height * keep))
    return trim(img.crop((0, 0, img.width, cut))) or img


def square_crop(img, top_ratio):
    """直式主體裁成正方形：多出來的高度依 top_ratio 分配到上方/下方裁掉"""
    extra = img.height - img.width
    if extra <= 0:
        return img
    t = round(extra * min(max(top_ratio, 0), 1))
    return img.crop((0, t, img.width, t + img.width))


STROKE = (0, "#2a2230")


def fit(img, w, h, margin, align, flush_bottom=False):
    canvas = _fit(img, w, h, margin, align, flush_bottom)
    ratio, color = STROKE
    return add_stroke(canvas, ratio * min(w, h), color) if ratio else canvas


def _fit(img, w, h, margin, align, flush_bottom=False):
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mw, mh = round(w * margin), round(h * margin)
    mb = 0 if flush_bottom else mh
    bw, bh = max(w - 2 * mw, 1), max(h - mh - mb, 1)
    scale = min(bw / img.width, bh / img.height)
    nw, nh = max(round(img.width * scale), 1), max(round(img.height * scale), 1)
    resized = img.resize((nw, nh), Image.LANCZOS)
    x = (w - nw) // 2
    y = (h - nh) // 2 if (align == "center" and not flush_bottom) else h - mb - nh
    canvas.alpha_composite(resized, (x, y))
    return canvas


def add_stroke(img, px, color):
    """在主體外圍加一圈實心描邊（在最終尺寸上做，粗細才會一致）"""
    if px <= 0:
        return img
    a = np.array(img)[..., 3].astype(np.float32) / 255
    r = int(np.ceil(px))
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = (xx ** 2 + yy ** 2) <= px ** 2 + 0.5
    grown = ndimage.grey_dilation(a, footprint=disk)
    rgb = hex_to_rgb(color).astype(np.uint8)
    under = np.zeros(a.shape + (4,), np.uint8)
    under[..., :3] = rgb
    under[..., 3] = (grown * 255).astype(np.uint8)
    base = Image.fromarray(under, "RGBA")
    base.alpha_composite(img)
    return base


def checker(w, h, s=16):
    yy, xx = np.mgrid[0:h, 0:w]
    c = (((yy // s) + (xx // s)) % 2).astype(np.uint8)
    v = np.where(c[..., None] == 1, 205, 245).astype(np.uint8)
    return Image.fromarray(np.repeat(v, 3, axis=2)).convert("RGBA")


# ---------- 主流程 ----------

def main():
    args = parse_args()
    global STROKE
    STROKE = (args.stroke, args.stroke_color)
    cols, rows = (int(v) for v in args.grid.lower().split("x"))
    sizes = [parse_size(s) for s in args.sizes.split(",") if s.strip()]
    out = Path(args.out)

    meta = {}
    meta_path = Path(args.meta)
    if meta_path.exists():
        meta = {m["id"]: m for m in json.loads(meta_path.read_text(encoding="utf-8"))}

    results = []  # (id, name, trimmed RGBA)
    idx = args.start
    for path in args.inputs:
        src = Image.open(path).convert("RGB")
        full = np.array(src)
        key = hex_to_rgb(args.key) if args.key != "auto" else detect_key(full)
        H, W = full.shape[:2]
        print(f"{path}: {W}x{H}, 背景色 #{''.join(f'{int(c):02x}' for c in key)}")

        for r in range(rows):
            for c in range(cols):
                x0, x1 = round(c * W / cols), round((c + 1) * W / cols)
                y0, y1 = round(r * H / rows), round((r + 1) * H / rows)
                cell = full[y0:y1, x0:x1]
                if args.rembg:
                    rgba = key_out_rembg(Image.fromarray(cell))
                else:
                    rgba = key_out(cell, key, args.tol, args.soft)
                rgba = choke(rgba, args.choke)
                rgba = drop_specks(rgba, args.min_blob)
                trimmed = trim(Image.fromarray(rgba, "RGBA"))
                if trimmed is not None and args.head:
                    trimmed = head_crop(trimmed, args.head)
                if trimmed is not None and args.square >= 0:
                    trimmed = square_crop(trimmed, args.square)
                name = meta.get(idx, {}).get("name", f"sticker{idx}")
                if trimmed is None:
                    print(f"  ⚠ #{idx:02d} {name}: 去背後是空的，請檢查背景色或容差")
                else:
                    results.append((idx, name, trimmed))
                idx += 1

    if not results:
        sys.exit("沒有可輸出的貼圖")

    fb = bool(args.head)  # 頭部特寫時，切口貼齊底邊，看起來像從畫框下緣探出
    targets = list(sizes)
    if args.master:
        targets = [(args.master, args.master)] + targets

    for i, (sid, name, img) in enumerate(results):
        fname = f"{sid:02d}_{name}.png"
        for j, (w, h) in enumerate(targets):
            folder = out / ("master" if (args.master and j == 0) else f"{w}x{h}")
            folder.mkdir(parents=True, exist_ok=True)
            fit(img, w, h, args.margin, args.align, fb).save(folder / fname, optimize=True)
        print(f"  ✓ #{sid:02d} {name}")

    # 總覽圖：棋盤格背景，方便檢查去背邊緣
    pw, ph = targets[0]
    tile = 160
    per_row = 8
    n = len(results)
    rows_n = (n + per_row - 1) // per_row
    sheet = checker(per_row * tile, rows_n * tile)
    for i, (sid, name, img) in enumerate(results):
        t = fit(img, tile, tile, 0.06, args.align, fb)
        sheet.alpha_composite(t, ((i % per_row) * tile, (i // per_row) * tile))
    sheet.convert("RGB").save(out / "preview.png")

    # 小尺寸總覽（實際大小），檢查 28px 時是否還看得懂
    small = min(sizes, key=lambda s: s[0] * s[1]) if sizes else None
    if small:
        sw, sh = small
        strip = checker(per_row * (sw + 8), rows_n * (sh + 8), s=4)
        for i, (sid, name, img) in enumerate(results):
            t = fit(img, sw, sh, args.margin, args.align, fb)
            strip.alpha_composite(t, ((i % per_row) * (sw + 8) + 4, (i // per_row) * (sh + 8) + 4))
        strip.convert("RGB").save(out / f"preview_{sw}x{sh}.png")

    print(f"\n完成 {len(results)} 張，輸出在 {out.resolve()}")


if __name__ == "__main__":
    main()

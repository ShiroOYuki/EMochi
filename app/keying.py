"""切割網格後的去背、去雜點、裁切、縮放（app/pipeline.py 使用）

原本是 tools/postprocess.py 命令列工具的核心；命令列流程在 2026-10-19 移除後搬進 app/。
背景色自動從整張圖外框偵測：綠幕 #00FF00、洋紅 #FF00FF 用全域色鍵，白／灰背景只去掉和邊緣相連的區域。
"""
import numpy as np
from PIL import Image
from scipy import ndimage


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


def fit(img, w, h, margin, align, flush_bottom=False):
    """等比縮進 w×h 畫布：margin 是比例留白；align="bottom" 或 flush_bottom 時貼齊底邊（底部不留白）"""
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


def checker(w, h, s=16):
    """棋盤格底圖（總覽圖用，看得出去背乾不乾淨）"""
    yy, xx = np.mgrid[0:h, 0:w]
    c = (((yy // s) + (xx // s)) % 2).astype(np.uint8)
    v = np.where(c[..., None] == 1, 205, 245).astype(np.uint8)
    return Image.fromarray(np.repeat(v, 3, axis=2)).convert("RGBA")

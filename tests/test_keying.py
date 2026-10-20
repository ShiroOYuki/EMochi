"""背景色偵測：角色蓋住大半個外框時（特寫、深色頭髮），也要抓到綠幕，不能把深色當背景"""
import numpy as np
from PIL import Image, ImageDraw


def _closeup_grid():
    """4×2 綠底，每格一個大的深色頭，上下左右都超出格子 → 外框大多是深色"""
    W, H, cols, rows = 2048, 1024, 4, 2
    im = Image.new("RGB", (W, H), (8, 250, 4))
    d = ImageDraw.Draw(im)
    cw, ch = W // cols, H // rows
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cw, r * ch
            d.rounded_rectangle((x0 + 30, y0 - 40, x0 + cw - 30, y0 + ch + 40), radius=120, fill=(30, 22, 18))   # 深色頭髮，貼滿上下
    return np.asarray(im)


def test_detect_key_ignores_dark_border():
    from app import keying
    a = _closeup_grid()
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    assert np.median(border, axis=0)[1] < 100          # 舊做法（外框中位數）會抓到深色
    k = keying.detect_key(a)
    assert k[1] > 230 and k[0] < 30 and k[2] < 30 and keying.is_chroma(k)


def test_detect_key_magenta_and_fallback():
    from app import keying
    m = np.zeros((200, 200, 3), np.uint8); m[:] = (250, 5, 245); m[50:150, 50:150] = (40, 200, 60)
    k = keying.detect_key(m)
    assert k[0] > 230 and k[1] < 30
    w = np.full((100, 100, 3), 245, np.uint8)          # 白底（不是綠也不是洋紅）：退回外框中位數
    assert keying.detect_key(w)[0] > 240

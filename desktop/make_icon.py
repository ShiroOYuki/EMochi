"""產生桌面版圖示 assets/icon.png（512）與 icon.ico：和 web/public/favicon.svg 同一對狐狸耳朵
uv run python desktop/make_icon.py"""
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024                       # 先畫大圖再縮，邊緣比較平滑
K = S / 32                     # favicon 的 viewBox 是 32×32
LINE, WHITE, PINK = (52, 49, 90, 255), (255, 255, 255, 255), (255, 141, 179, 255)
EARS = [[(2.5, 28), (8.5, 4), (16.5, 20)], [(29.5, 28), (23.5, 4), (15.5, 20)]]
INNER = [[(7.6, 20), (9.4, 10.2), (13.6, 18.2)], [(24.4, 20), (22.6, 10.2), (18.4, 18.2)]]


PAD = 0.86                     # 縮小一點留邊


def pts(poly, dy=0.0):
    return [((16 + (x - 16) * PAD) * K, (16 + (y + dy - 16) * PAD) * K) for x, y in poly]


def main():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    dy = -1.0                  # 圖形整體偏下，往上移一點置中
    for ear in EARS:
        d.polygon(pts(ear, dy), fill=WHITE, outline=LINE, width=round(1.7 * K))
    for inner in INNER:
        d.polygon(pts(inner, dy), fill=PINK)
    out = Path(__file__).parent / "assets"
    out.mkdir(exist_ok=True)
    big = im.resize((512, 512), Image.LANCZOS)
    big.save(out / "icon.png")
    big.save(out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == "__main__":
    main()

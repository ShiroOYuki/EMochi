"""產生桌面版圖示 assets/icon.png（512）與 icon.ico（16～256）：和 web/public/favicon.svg 同一對狐狸耳朵

uv run python desktop/make_icon.py [--variant halo|plate] [--out 資料夾]

和 favicon.svg 用同一組座標（viewBox 32×32），畫法也照 SVG：
  每隻耳朵先填白、再描「置中、圓角」的深色外框（PIL 的 polygon outline 是往內畫、尖角，不能用），
  第二隻耳朵蓋在第一隻上面，最後畫粉紅耳內。
小尺寸（16／24／32）另外畫：外框加粗、耳內放大，縮小後才不會糊成一團。
variant：
  halo   外框外再加一圈白邊，深色工作列上也看得到輪廓（預設）
  plate  墊一塊淺色圓角方形底板，圖形放在板子上
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

LINE, WHITE, PINK = (52, 49, 90, 255), (255, 255, 255, 255), (255, 141, 179, 255)
EARS = [[(2.5, 28), (8.5, 4), (16.5, 20)], [(29.5, 28), (23.5, 4), (15.5, 20)]]
INNER = [[(7.6, 20), (9.4, 10.2), (13.6, 18.2)], [(24.4, 20), (22.6, 10.2), (18.4, 18.2)]]
SIZES = [16, 24, 32, 48, 64, 128, 256]
SS = 8                          # 超取樣倍數：先畫 8 倍大再縮，邊緣平滑

# 依輸出尺寸調整：外框粗細（viewBox 單位）、耳內放大倍率
def style_for(px: int) -> dict:
    if px <= 16:
        return {"stroke": 3.6, "inner": 1.25}
    if px <= 24:
        return {"stroke": 3.2, "inner": 1.18}
    if px <= 32:
        return {"stroke": 2.9, "inner": 1.12}
    return {"stroke": 2.4, "inner": 1.0}


def bbox(polys, pad):
    xs = [x for p in polys for x, _ in p]
    ys = [y for p in polys for _, y in p]
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad


def scale_poly(poly, k):
    """以三角形重心為中心放大（耳內放大用）"""
    cx = sum(x for x, _ in poly) / 3
    cy = sum(y for _, y in poly) / 3
    return [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in poly]


def stroke(d: ImageDraw.ImageDraw, pts, width, color):
    """置中、圓角的外框：每條邊畫粗線，每個頂點補一個圓"""
    r = width / 2
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        d.line([a, b], fill=color, width=round(width))
    for x, y in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def render(px: int, variant: str) -> Image.Image:
    st = style_for(px)
    S = px * SS
    halo = 1.6 if variant == "halo" else 0.0         # 白邊寬度（viewBox 單位，加在外框外側）
    plate = variant == "plate"
    # 圖形外框（含線寬、白邊）要佔畫布的比例；有底板時圖形縮小放在板子中間
    fill_ratio = 0.62 if plate else 0.90
    x0, y0, x1, y1 = bbox(EARS, st["stroke"] / 2 + halo)
    k = S * fill_ratio / max(x1 - x0, y1 - y0)
    ox = (S - (x1 - x0) * k) / 2 - x0 * k
    oy = (S - (y1 - y0) * k) / 2 - y0 * k
    # 視覺置中：兩個尖角在上、底部比較重，整體往下挪一點
    oy += S * 0.015
    tf = lambda poly: [(ox + x * k, oy + y * k) for x, y in poly]   # noqa: E731

    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if plate:
        r = S * 0.22
        m = S * 0.03
        d.rounded_rectangle([m, m, S - m, S - m], radius=r, fill=(238, 241, 250, 255), outline=(214, 220, 240, 255), width=max(1, round(S * 0.012)))
    if halo:
        for ear in EARS:
            p = tf(ear)
            d.polygon(p, fill=WHITE)
            stroke(d, p, (st["stroke"] + halo * 2) * k, WHITE)
    for ear in EARS:
        p = tf(ear)
        d.polygon(p, fill=WHITE)
        stroke(d, p, st["stroke"] * k, LINE)
    for inner in INNER:
        d.polygon(tf(scale_poly(inner, st["inner"])), fill=PINK)
    return im.resize((px, px), Image.LANCZOS)


def build(variant: str, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    render(512, variant).save(out / "icon.png")
    imgs = [render(s, variant) for s in SIZES]
    # 每個尺寸都是各自畫的；ICO 依 sizes 從 append_images 挑同尺寸的圖
    imgs[-1].save(out / "icon.ico", sizes=[(s, s) for s in SIZES], append_images=imgs[:-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["halo", "plate"], default="halo")
    ap.add_argument("--out", default=str(Path(__file__).parent / "assets"))
    a = ap.parse_args()
    build(a.variant, Path(a.out))


if __name__ == "__main__":
    main()

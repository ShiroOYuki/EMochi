"""匯出預設集：每組＝要輸出的尺寸、縮放方式、邊距、檔案大小上限、檔名方式

存在 <設定檔資料夾>/export_presets.json（本地資料，不進版控）；還沒有的話用內建的 config/export_presets.example.json
（各平台規格，2026-10-20 查）。第一次在畫面上修改時才寫出 export_presets.json。

縮放方式（mode）
  fit     等比縮進「寬×高」的框內，輸出圖片＝縮好的大小（母版是正方形，所以輸出邊長＝min(寬, 高)）
  canvas  輸出剛好「寬×高」的透明畫布，貼圖等比縮小後置中（例如 LINE 聊天室標籤 96×74）
margin：四周再留的透明邊（px，含在輸出尺寸裡）；even：輸出寬高都取偶數（LINE 規定）
naming：keep＝沿用原檔名（01_happy_s6.png）；index＝每個畫風依序 01.png、02.png…（LINE 上架要的檔名）
group：分組（通常是平台名稱，例如 LINE）；匯出時的選單照分組排，空白歸到「其他」
"""

import io
import re
import threading

from PIL import Image

from .errors import Invalid
from .migrations import migrate_presets
from .paths import BUILTIN_CONFIG, config_dir, read_json, write_json

EXAMPLE = BUILTIN_CONFIG / "export_presets.example.json"
MODES = ("fit", "canvas")
NAMINGS = ("keep", "index")
MIN_PX, MAX_PX = 8, 2048
MAX_SIZES = 8
MAX_KB = 20 * 1024
_lock = threading.Lock()


def file():
    return config_dir() / "export_presets.json"


def is_custom() -> bool:
    """使用者是否改過（有自己的 export_presets.json）"""
    return file().exists()


def load() -> list[dict]:
    builtin = read_json(EXAMPLE, [])
    items = read_json(file())
    if items is None:
        items = builtin
    return [normalize(p) for p in migrate_presets(items, builtin)]


def get(pid: str) -> dict | None:
    return next((p for p in load() if p["id"] == pid), None)


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "_", str(s).lower()).strip("_-")


def _int(v, lo, hi, what) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise Invalid(f"{what}要填整數") from None
    if not lo <= n <= hi:
        raise Invalid(f"{what}要在 {lo}～{hi} 之間")
    return n


def normalize(p: dict, *, strict: bool = False) -> dict:
    """整理一組預設集；strict＝畫面送來的，欄位不對就丟 ValueError（讀檔時盡量容錯）"""
    name = str(p.get("name") or "").strip()[:40]
    if strict and not name:
        raise Invalid("預設集要有名稱")
    sizes = []
    for s in p.get("sizes") or []:
        w = _int(s.get("w"), MIN_PX, MAX_PX, "寬度")
        h = _int(s.get("h", w), MIN_PX, MAX_PX, "高度")
        if (w, h) not in [(x["w"], x["h"]) for x in sizes]:
            sizes.append({"w": w, "h": h})
    if not sizes:
        if strict:
            raise Invalid(f"「{name or '預設集'}」至少要有一個尺寸")
        sizes = [{"w": 128, "h": 128}]
    if len(sizes) > MAX_SIZES:
        raise Invalid(f"一組最多 {MAX_SIZES} 個尺寸")
    mode = p.get("mode") if p.get("mode") in MODES else "fit"
    smallest = min(min(s["w"], s["h"]) for s in sizes)
    margin = _int(p.get("margin") or 0, 0, max(0, smallest // 4), "邊距")
    max_kb = p.get("max_kb")
    max_kb = None if max_kb in (None, "", 0) else _int(max_kb, 1, MAX_KB, "檔案大小上限（KB）")
    pid = _slug(p.get("id") or name) or "preset"
    folder = _slug(p.get("folder") or pid) or pid
    group = str(p.get("group") or "").strip()[:20]
    return {
        "id": pid,
        "name": name or pid,
        "group": group,
        "folder": folder,
        "sizes": sizes,
        "mode": mode,
        "margin": margin,
        "even": bool(p.get("even")),
        "max_kb": max_kb,
        "naming": p.get("naming") if p.get("naming") in NAMINGS else "keep",
        "note": str(p.get("note") or "").strip()[:200],
    }


def save(items: list[dict]) -> list[dict]:
    out, seen_id, seen_folder = [], set(), set()
    for raw in items:
        p = normalize(raw, strict=True)
        if p["id"] in seen_id:
            raise Invalid(f"預設集代號重複：{p['id']}")
        if p["folder"] in seen_folder:
            raise Invalid(f"資料夾名稱重複：{p['folder']}（zip 裡會撞在一起）")
        seen_id.add(p["id"])
        seen_folder.add(p["folder"])
        out.append(p)
    with _lock:
        write_json(file(), out)
    return out


def reset() -> list[dict]:
    """回到內建預設集（使用者的檔案改名成 .bak 留著，不直接刪）"""
    with _lock:
        f = file()
        if f.exists():
            f.replace(f.with_suffix(".json.bak"))
    return load()


def custom(raw: dict) -> dict:
    """匯出時「自訂」的單次設定：不存檔，資料夾固定 custom"""
    return normalize({**raw, "id": "custom", "name": "自訂", "folder": "custom", "group": ""}, strict=True)


# ---------- 輸出 ----------


def out_size(size: dict, mode: str, even: bool, src: tuple[int, int] = (512, 512)) -> tuple[int, int]:
    """這個尺寸實際輸出的寬高"""
    w, h = size["w"], size["h"]
    if mode == "fit":
        scale = min(w / src[0], h / src[1])
        w, h = max(1, round(src[0] * scale)), max(1, round(src[1] * scale))
    if even:
        w, h = w - w % 2, h - h % 2
    return w, h


def render(master: Image.Image, size: dict, mode: str, margin: int, even: bool) -> Image.Image:
    """從 512 母版縮出一張：等比縮小、置中、四周留 margin"""
    master = master.convert("RGBA")
    W, H = out_size(size, mode, even, master.size)
    bw, bh = max(1, W - 2 * margin), max(1, H - 2 * margin)
    scale = min(bw / master.width, bh / master.height)
    nw, nh = max(1, round(master.width * scale)), max(1, round(master.height * scale))
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(master.resize((nw, nh), Image.LANCZOS), ((W - nw) // 2, (H - nh) // 2))
    return canvas


def to_png(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def size_label(size: dict) -> str:
    """zip 裡的子資料夾：正方形用邊長（twitch/112，和舊版一樣），其他用 寬x高"""
    return str(size["w"]) if size["w"] == size["h"] else f"{size['w']}x{size['h']}"

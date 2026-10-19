"""Gallery：掃描各畫風成品、匯出 zip（加版本後綴）、組合總覽圖、勾選清單 JSON
（邏輯沿用 tools/viewer.py）"""
import io
import json
import re
import time
import zipfile

from PIL import Image, ImageDraw, ImageFont

from . import characters, specs
from .paths import EXPORTS, OUTPUTS, load_styles_cfg, read_json, sticker_map

FORMATS = {
    "master": ("Master 512", "master"),
    "t112": ("Twitch 112", "twitch/112"),
    "t56": ("Twitch 56", "twitch/56"),
    "t28": ("Twitch 28", "twitch/28"),
    "discord": ("Discord 128", "discord"),
}


def scan() -> list[dict]:
    meta = sticker_map()
    names = {k: v.get("name", "") for k, v in load_styles_cfg().get("styles", {}).items()}
    chars = {c["id"]: c["name"] for c in characters.list_all()}
    # s1～s5 是網頁工具之前做的、沒有 project.json，畫的都是原角色（啟動時被搬成角色庫第一個角色）
    legacy_char = next(iter(chars), None)
    styles = []
    for master in sorted(OUTPUTS.glob("*/final/master")):
        final = master.parent
        sid = final.parent.name
        items = []
        for f in sorted(master.glob("*.png")):
            m = re.match(r"(\d+)_(.+)\.png$", f.name)
            if not m:
                continue
            num, name = int(m.group(1)), m.group(2)
            files = {}
            for k, (_, sub) in FORMATS.items():
                fn = f"{name}.png" if k == "discord" else f.name
                if (final / sub / fn).exists():
                    files[k] = f"{sid}/final/{sub}/{fn}"
            info = meta.get(num, {})
            items.append({"id": num, "name": name, "label": info.get("label", name), "zh": info.get("zh", ""),
                          "group": info.get("group") or ((num - 1) // 8 + 1), "files": files,
                          "mtime": int(f.stat().st_mtime)})
        if items:
            proj = read_json(OUTPUTS / sid / "project.json")
            cid = ((proj.get("refs") or {}).get("character_id")) if proj else legacy_char
            styles.append({"id": sid, "name": (proj or {}).get("name") or names.get(sid, ""), "items": items,
                           "character_id": cid, "character_name": chars.get(cid, "") if cid else ""})
    styles.sort(key=lambda s: (len(s["id"]), s["id"]))
    return styles


def find(styles, key):
    sid, num = key.split(":")
    for s in styles:
        if s["id"] == sid:
            for it in s["items"]:
                if it["id"] == int(num):
                    return s, it
    return None, None


def stamp() -> str:
    return time.strftime("%Y%m%d_%H%M%S")


def clean_tag(tag) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", (tag or "").strip())[:20]


def suffixed(fname: str, style: str, tag: str) -> str:
    """01_happy.png -> 01_happy_s1.png / 01_happy_s1_v1.png"""
    stem, ext = fname.rsplit(".", 1)
    return f"{stem}_{style}{'_' + tag if tag else ''}.{ext}"


def selection_doc(keys, **extra) -> dict:
    styles = scan()
    items = []
    for k in keys:
        s, it = find(styles, k)
        if it:
            items.append({"key": k, "style": s["id"], "id": it["id"], "name": it["name"]})
    doc = {"version": 1, "created": time.strftime("%Y-%m-%d %H:%M:%S"),
           "keys": [i["key"] for i in items], "items": items}
    doc.update({k: v for k, v in extra.items() if v is not None})
    return doc


def write_export_json(name: str, doc: dict) -> str:
    EXPORTS.mkdir(exist_ok=True)
    (EXPORTS / name).write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return name


def list_selections() -> list[dict]:
    if not EXPORTS.exists():
        return []
    out = []
    for f in sorted(EXPORTS.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"file": f.name, "count": len(d.get("keys", [])), "created": d.get("created", ""),
                        "kind": d.get("kind", ""), "tag": d.get("tag") or (d.get("version") if isinstance(d.get("version"), str) else None)})
        except Exception:  # noqa: BLE001
            pass
    return out


def export(keys, fmts, tag="") -> dict:
    """匯出 zip；每個檔案先過 specs.fit()（尺寸、平台大小上限，超過就壓縮），問題列在 issues。
    原始檔不動，壓縮只影響 zip 裡的那一份"""
    tag = clean_tag(tag)
    styles = scan()
    buf = io.BytesIO()
    n = 0
    issues: list[dict] = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for key in keys:
            s, it = find(styles, key)
            if not it:
                continue
            for k in fmts:
                if k in it["files"]:
                    src = OUTPUTS / it["files"][k]
                    arc = f"{s['id']}/{FORMATS[k][1]}/{suffixed(src.name, s['id'], tag)}"
                    data, notes = specs.fit(src.read_bytes(), k)
                    z.writestr(arc, data)
                    if notes:
                        issues.append({"file": arc, "notes": notes})
                    n += 1
    EXPORTS.mkdir(exist_ok=True)
    st = stamp()
    name = f"export_{st}{'_' + tag if tag else ''}.zip"
    (EXPORTS / name).write_bytes(buf.getvalue())
    write_export_json(f"export_{st}.json", selection_doc(keys, kind="export", formats=list(fmts), zip=name,
                                                        tag=tag or None, issues=issues or None))
    return {"file": name, "count": n, "issues": issues}


def save_selection(keys, formats=None, combine=None, tag="") -> dict:
    doc = selection_doc(keys, kind="selection", formats=formats, combine=combine, tag=clean_tag(tag) or None)
    name = write_export_json(f"selection_{stamp()}.json", doc)
    return {"file": name, "count": len(doc["keys"])}


def _font(px):
    for f in ["arial.ttf", "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(f, px)
        except Exception:  # noqa: BLE001
            pass
    return ImageFont.load_default()


def combine(keys, cols=8, cell=128, gap=8, bg="transparent", labels=False) -> dict:
    orig = list(keys)
    styles = scan()
    imgs = []
    for key in sorted(keys, key=lambda k: (int(k.split(":")[1]), k.split(":")[0])):
        s, it = find(styles, key)
        if it and "master" in it["files"]:
            im = Image.open(OUTPUTS / it["files"]["master"]).convert("RGBA").resize((cell, cell), Image.LANCZOS)
            imgs.append((im, f"{s['id']} {it['label']}"))
    if not imgs:
        raise ValueError("沒有可組合的貼圖")
    cols = max(1, min(cols, len(imgs)))
    rows = (len(imgs) + cols - 1) // cols
    lab_h = max(14, cell // 7) if labels else 0
    W, H = cols * cell + (cols + 1) * gap, rows * (cell + lab_h) + (rows + 1) * gap
    bgc = {"transparent": (0, 0, 0, 0), "dark": (49, 51, 56, 255), "light": (255, 255, 255, 255)}[bg]
    sheet = Image.new("RGBA", (W, H), bgc)
    d = ImageDraw.Draw(sheet)
    font = _font(max(10, lab_h - 4))
    txt = (230, 230, 230, 255) if bg == "dark" else (40, 40, 40, 255)
    for i, (im, lab) in enumerate(imgs):
        r, c = divmod(i, cols)
        x, y = gap + c * (cell + gap), gap + r * (cell + lab_h + gap)
        sheet.alpha_composite(im, (x, y))
        if labels:
            tw = d.textlength(lab, font=font)
            d.text((x + (cell - tw) / 2, y + cell + 1), lab, fill=txt, font=font)
    EXPORTS.mkdir(exist_ok=True)
    st = stamp()
    name = f"sheet_{st}.png"
    sheet.save(EXPORTS / name, "PNG", optimize=True)
    write_export_json(f"sheet_{st}.json", selection_doc(orig, kind="combine", sheet=name, combine={
        "cols": cols, "cell": cell, "gap": gap, "bg": bg, "labels": labels}))
    return {"file": name}

"""Gallery：掃描各畫風成品、匯出 zip（加版本後綴）、組合總覽圖、勾選清單 JSON
"""
import io
import json
import re
import time
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from . import characters, presets, specs
from .paths import outputs_dir, exports_dir, read_json, sticker_map

# 後處理（pipeline）已經產生好的檔案（scan() 回傳的 files）；匯出預設集剛好要這些尺寸時直接沿用，畫質和以前一樣
FORMATS = {
    "master": ("Master 512", "master"),
    "t112": ("Twitch 112", "twitch/112"),
    "t56": ("Twitch 56", "twitch/56"),
    "t28": ("Twitch 28", "twitch/28"),
    "discord": ("Discord 128", "discord"),
}


def scan() -> list[dict]:
    meta = sticker_map()
    chars = {c["id"]: c["name"] for c in characters.list_all()}
    styles = []
    for master in sorted(outputs_dir().glob("*/final/master")):
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
                          "files": files,
                          "mtime": int(f.stat().st_mtime)})
        if items:
            proj = read_json(outputs_dir() / sid / "project.json") or {}
            cid = (proj.get("refs") or {}).get("character_id")
            styles.append({"id": sid, "name": proj.get("name", ""), "items": items,
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
    exports_dir().mkdir(parents=True, exist_ok=True)
    (exports_dir() / name).write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return name


def list_selections() -> list[dict]:
    if not exports_dir().exists():
        return []
    out = []
    for f in sorted(exports_dir().glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"file": f.name, "count": len(d.get("keys", [])), "created": d.get("created", ""),
                        "kind": d.get("kind", ""), "tag": d.get("tag") or (d.get("version") if isinstance(d.get("version"), str) else None)})
        except Exception:  # noqa: BLE001
            pass
    return out


PREMADE = {112: "t112", 56: "t56", 28: "t28", 128: "discord", 512: "master"}   # 正方形邊長 → 後處理的檔案
LEGACY = {"t112": ("twitch", 112), "t56": ("twitch", 56), "t28": ("twitch", 28), "discord": ("discord", 128), "master": ("master", 512)}


def legacy_presets(fmts) -> list[dict]:
    """舊版的格式代號（t112、discord…，舊的勾選清單、舊 API）→ 對應的內建預設集（只留勾到的尺寸）"""
    builtin = {p["id"]: p for p in (presets.normalize(x) for x in read_json(presets.EXAMPLE, []))}
    out: dict[str, dict] = {}
    for f in fmts or []:
        if f not in LEGACY:
            continue
        pid, px = LEGACY[f]
        p = out.setdefault(pid, {**builtin[pid], "sizes": []})
        p["sizes"].append({"w": px, "h": px})
    return list(out.values())


def _image_bytes(it: dict, master_img, preset: dict, size: dict) -> tuple[bytes, list[str]]:
    """一張貼圖的一個尺寸：剛好是後處理產生過的（正方形、沒有額外邊距）就沿用，否則從 512 母版縮。
    沿用的檔案尺寸不對（舊版後處理的問題）→ 改從母版重縮，並在說明裡提一下"""
    w, h = presets.out_size(size, preset["mode"], preset["even"])
    if w == h and preset["margin"] == 0 and PREMADE.get(w) in it["files"]:
        data = (outputs_dir() / it["files"][PREMADE[w]]).read_bytes()
        got = Image.open(io.BytesIO(data)).size
        if got == (w, h):
            return data, []
        note = f"後處理的檔案是 {got[0]}×{got[1]}，不是 {w}×{h}，已改用母版重新縮"
        return presets.to_png(presets.render(master_img(), size, preset["mode"], preset["margin"], preset["even"])), [note]
    return presets.to_png(presets.render(master_img(), size, preset["mode"], preset["margin"], preset["even"])), []


def export(keys, preset_ids=None, custom=None, tag="", fmts=None) -> dict:
    """匯出 zip：<畫風>/<預設集資料夾>/<尺寸>/<檔名>；每個檔案依預設集的大小上限檢查，超過就壓縮（specs.compress），
    問題列在 issues。原始檔不動。
    preset_ids：要用的預設集；custom：單次自訂（不存檔）；fmts：舊版格式代號（相容舊的勾選清單）"""
    tag = clean_tag(tag)
    chosen = [p for p in (presets.get(i) for i in preset_ids or []) if p] + legacy_presets(fmts)
    if custom:
        chosen.append(presets.custom(custom))
    if not chosen:
        raise ValueError("請至少選一個預設集，或填寫自訂尺寸")
    styles = scan()
    picked = [(s, it) for s, it in (find(styles, k) for k in keys) if it and "master" in it["files"]]
    # 序號檔名（LINE）：每個畫風依貼圖編號排序後 01、02…
    order = {}
    for s, it in picked:
        order.setdefault(s["id"], []).append(it["id"])
    index = {(sid, num): i for sid, nums in order.items() for i, num in enumerate(sorted(nums), 1)}
    buf = io.BytesIO()
    n = 0
    issues: list[dict] = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for s, it in picked:
            cache = {}
            def master_img(it=it, cache=cache):
                if "im" not in cache:
                    cache["im"] = Image.open(outputs_dir() / it["files"]["master"]).convert("RGBA")
                return cache["im"]
            src_name = Path(it["files"]["master"]).name
            for p in chosen:
                for size in p["sizes"]:
                    sub = p["folder"] if len(p["sizes"]) == 1 else f"{p['folder']}/{presets.size_label(size)}"
                    fname = (f"{index[(s['id'], it['id'])]:02d}.png" if p["naming"] == "index"
                             else suffixed(src_name, s["id"], tag))
                    arc = f"{s['id']}/{sub}/{fname}"
                    raw, notes = _image_bytes(it, master_img, p, size)
                    label = f"{p['name']} {presets.size_label(size)}"
                    data, more = specs.compress(raw, label, p["max_kb"] * 1024 if p["max_kb"] else None)
                    notes += more
                    z.writestr(arc, data)
                    if notes:
                        issues.append({"file": arc, "notes": notes})
                    n += 1
    exports_dir().mkdir(parents=True, exist_ok=True)
    st = stamp()
    name = f"export_{st}{'_' + tag if tag else ''}.zip"
    (exports_dir() / name).write_bytes(buf.getvalue())
    write_export_json(f"export_{st}.json", selection_doc(
        keys, kind="export", presets=[p["id"] for p in chosen if p["id"] != "custom"],
        custom=presets.custom(custom) if custom else None, zip=name, tag=tag or None, issues=issues or None))
    return {"file": name, "count": n, "issues": issues}


def save_selection(keys, presets=None, custom=None, combine=None, tag="", formats=None) -> dict:
    doc = selection_doc(keys, kind="selection", presets=presets, custom=custom, formats=formats, combine=combine,
                        tag=clean_tag(tag) or None)
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
            im = Image.open(outputs_dir() / it["files"]["master"]).convert("RGBA").resize((cell, cell), Image.LANCZOS)
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
    exports_dir().mkdir(parents=True, exist_ok=True)
    st = stamp()
    name = f"sheet_{st}.png"
    sheet.save(exports_dir() / name, "PNG", optimize=True)
    write_export_json(f"sheet_{st}.json", selection_doc(orig, kind="combine", sheet=name, combine={
        "cols": cols, "cell": cell, "gap": gap, "bg": bg, "labels": labels}))
    return {"file": name}

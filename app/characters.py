"""角色庫：characters/<id>/character.json ＋ refs/

character.json
  id, name, identity（放進 prompt 的英文角色特徵）, notes_zh,
  images: [{file, use, source}]   use = 新畫風預設是否附上這張；source = 上傳時的原檔名
  next_index                      下一張圖的流水號

每個角色的圖片檔名都用同一套：ref_01.png、ref_02.png…（角色靠資料夾區分）。
流水號只增不減：移除 ref_02 之後新上傳的是 ref_03，不會沿用舊號，
這樣已經記錄「用了 ref_02」的畫風專案不會在不知情下換成另一張圖。
"""
import json
import re
import threading
from datetime import datetime
from pathlib import Path

from . import codex
from .images import move_to_removed, save_png
from .paths import CONFIG, OUTPUTS, REFS, ROOT, load_styles_cfg, read_json, save_styles_cfg, write_json

CHAR_DIR = ROOT / "characters"
_lock = threading.Lock()


def _json(cid: str) -> Path:
    return CHAR_DIR / cid / "character.json"


def refs_dir(cid: str) -> Path:
    return CHAR_DIR / cid / "refs"


def get(cid: str) -> dict | None:
    c = read_json(_json(cid))
    if c:
        c["images"] = [i for i in c.get("images", []) if (refs_dir(cid) / i["file"]).exists()]
    return c


def list_all() -> list[dict]:
    out = []
    if CHAR_DIR.exists():
        for f in sorted(CHAR_DIR.glob("*/character.json")):
            c = get(f.parent.name)
            if c:
                out.append(c)
    return sorted(out, key=lambda c: c.get("created", ""))


def _save(c: dict) -> dict:
    c["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    write_json(_json(c["id"]), c)
    return c


PREFIX = "ref"
STD_RE = re.compile(rf"^{PREFIX}_(\d{{2,}})\.png$")
LEGACY_RE = re.compile(r"^c\d+_(\d{2,})\.png$")   # 前一版的 c2_01.png


def std_name(n: int) -> str:
    return f"{PREFIX}_{n:02d}.png"


def _take_name(c: dict, want: int | None = None) -> str:
    """發下一個標準檔名（並推進流水號）；want = 想沿用的號碼（舊版改名時保留原本的號）"""
    folder = refs_dir(c["id"])
    if want is not None and not (folder / std_name(want)).exists():
        c["next_index"] = max(c.get("next_index", 1), want + 1)
        return std_name(want)
    used = [int(m.group(1)) for i in c["images"] if (m := STD_RE.match(i["file"]))]
    n = max([c.get("next_index", 1), *(u + 1 for u in used)])
    while (folder / std_name(n)).exists():
        n += 1
    c["next_index"] = n + 1
    return std_name(n)


def _store(c: dict, files: list[tuple[str, bytes]], use: bool = True) -> None:
    for fname, raw in files:
        c["images"].append({"file": save_png(raw, refs_dir(c["id"]), fname, exact=_take_name(c)),
                            "use": use, "source": fname})


def _new_id() -> str:
    n = 1
    while (CHAR_DIR / f"c{n}").exists():
        n += 1
    return f"c{n}"


def ensure_default() -> None:
    """第一次啟動：把 refs/ 的原角色搬成 c1，角色特徵沿用原本 prompt 模板裡的那段"""
    if list_all():
        return
    tpl = read_json(CONFIG / "prompt_template.json", {}) or {}
    with _lock:
        cid = _new_id()
        c = {"id": cid, "name": "白狐（原角色）", "identity": tpl.get("identity", ""), "notes_zh": "",
             "images": [], "next_index": 1, "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        for name in ("ref.png", "ref_tvd.png"):
            if (REFS / name).exists():
                _store(c, [(name, (REFS / name).read_bytes())], use=name == "ref.png")
        _save(c)


def create(name: str, files: list[tuple[str, bytes]]) -> dict:
    if not name.strip():
        raise ValueError("請輸入角色名稱")
    with _lock:
        c = {"id": _new_id(), "name": name.strip(), "identity": "", "notes_zh": "", "images": [],
             "next_index": 1, "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        _store(c, files)
        return _save(c)


def update(cid: str, fields: dict) -> dict:
    with _lock:
        c = get(cid)
        if not c:
            raise KeyError(cid)
        for k in ("name", "identity", "notes_zh"):
            if k in fields:
                c[k] = fields[k]
        if "use" in fields:   # {file: bool}
            for i in c["images"]:
                if i["file"] in fields["use"]:
                    i["use"] = bool(fields["use"][i["file"]])
        return _save(c)


def add_images(cid: str, files: list[tuple[str, bytes]]) -> dict:
    with _lock:
        c = get(cid)
        if not c:
            raise KeyError(cid)
        _store(c, files)
        return _save(c)


def remove_image(cid: str, file: str) -> dict:
    with _lock:
        c = get(cid)
        if not c:
            raise KeyError(cid)
        move_to_removed(refs_dir(cid) / Path(file).name)
        c["images"] = [i for i in c["images"] if i["file"] != file]
        return _save(c)


def normalize_names() -> dict[str, dict[str, str]]:
    """把不是標準檔名的角色圖改名（舊版上傳、手動丟進資料夾的），
    並同步更新引用到它們的畫風專案與 styles.json。回傳 {角色id: {舊檔名: 新檔名}}"""
    renamed: dict[str, dict[str, str]] = {}
    with _lock:
        for c in list_all():
            mapping = {}
            known = {i["file"] for i in c["images"]}
            # 資料夾裡有、json 沒記錄的圖也收進來（預設不勾）
            for f in sorted(refs_dir(c["id"]).glob("*")):
                if f.is_file() and f.name not in known and f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                    c["images"].append({"file": f.name, "use": False})
            for i in c["images"]:
                if STD_RE.match(i["file"]):
                    continue
                old = i["file"]
                src = refs_dir(c["id"]) / old
                legacy = LEGACY_RE.match(old)
                new = _take_name(c, int(legacy.group(1)) if legacy else None)
                if src.suffix.lower() == ".png":
                    src.replace(refs_dir(c["id"]) / new)
                else:   # jpg/webp → 轉 PNG，原檔移到 _removed/
                    save_png(src.read_bytes(), refs_dir(c["id"]), old, exact=new)
                    move_to_removed(src)
                i.update(file=new, source=i.get("source") or old)
                mapping[old] = new
            if mapping or "next_index" not in c:
                c.setdefault("next_index", 1)
                _save(c)
            if mapping:
                renamed[c["id"]] = mapping
    if renamed:
        _rewrite_references(renamed)
    return renamed


def _rewrite_references(renamed: dict[str, dict[str, str]]) -> None:
    def path_map(p: str) -> str:
        for cid, m in renamed.items():
            prefix = f"characters/{cid}/refs/"
            if p.startswith(prefix) and p[len(prefix):] in m:
                return prefix + m[p[len(prefix):]]
        return p

    for f in OUTPUTS.glob("*/project.json"):
        p = read_json(f)
        if not p:
            continue
        before = json.dumps(p, ensure_ascii=False)
        r = p.get("refs") or {}
        m = renamed.get(r.get("character_id") or "")
        if m and r.get("character_images"):
            r["character_images"] = [m.get(x, x) for x in r["character_images"]]
        for item in [p.get("preview") or {}, *p.get("groups", [])]:
            if item.get("refs"):
                item["refs"] = [path_map(x) for x in item["refs"]]
        if json.dumps(p, ensure_ascii=False) != before:
            write_json(f, p)
    cfg = load_styles_cfg()
    changed = False
    for s in cfg.get("styles", {}).values():
        for key in ("refs", "group1_refs"):
            if s.get(key):
                new = [path_map(x) for x in s[key]]
                changed |= new != s[key]
                s[key] = new
    if changed:
        save_styles_cfg(cfg)


def rel_paths(cid: str, files: list[str] | None = None) -> list[str]:
    """files=None → 角色預設勾選的圖"""
    c = get(cid)
    if not c:
        return []
    names = [i["file"] for i in c["images"] if (i["use"] if files is None else i["file"] in files)]
    return [(refs_dir(cid) / n).relative_to(ROOT).as_posix() for n in names]


# ---------- 讓 Codex 看圖寫角色特徵 ----------

DESCRIBE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["identity", "notes_zh"],
    "properties": {
        "identity": {"type": "string"},
        "notes_zh": {"type": "string"},
    },
}


def describe(cid: str) -> dict:
    c = get(cid)
    if not c or not c["images"]:
        raise ValueError("請先上傳角色圖片")
    imgs = rel_paths(cid, [i["file"] for i in c["images"]])
    prompt = f"""Look at the attached reference images of ONE original character named "{c['name']}".
Do not run any tools and do not generate images. Answer only with the JSON required by the output schema.

`identity`: ONE English sentence starting with "Character identity to keep:" that lists only the stable, visible traits an
illustrator must keep to draw this exact character in ANY art style: hair color/length/notable shape, ears/horns/tail if any,
eye color, skin tone if notable, signature accessories (say which side of the head, from the character's point of view and
the viewer's), and the key outfit color/neckwear. Max ~45 words, concrete colors, no rendering-style words.

`notes_zh`: 繁體中文，一兩句說明你抓到的特徵，以及哪些細節在 28x28 小圖會看不出來。"""
    schema = codex.LOGS / "characters" / f"{cid}_schema.json"
    schema.parent.mkdir(parents=True, exist_ok=True)
    schema.write_text(json.dumps(DESCRIBE_SCHEMA), encoding="utf-8")
    answer = codex.run_text(prompt, schema, codex.log_path_for("characters", f"{cid}_describe"), images=imgs)
    data = json.loads(answer)
    return update(cid, {"identity": data["identity"], "notes_zh": data.get("notes_zh", "")})

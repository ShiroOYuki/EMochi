"""角色庫：characters/<id>/character.json ＋ refs/

character.json
  id, name, identity（放進 prompt 的英文角色特徵）, notes_zh,
  images: [{file, use}]   use = 新畫風預設是否附上這張
"""
import json
import threading
from datetime import datetime
from pathlib import Path

from . import codex
from .images import move_to_removed, save_png
from .paths import CONFIG, REFS, ROOT, read_json, write_json

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
        images = []
        for name in ("ref.png", "ref_tvd.png"):
            src = REFS / name
            if src.exists():
                images.append({"file": save_png(src.read_bytes(), refs_dir(cid), name), "use": name == "ref.png"})
        _save({"id": cid, "name": "白狐（原角色）", "identity": tpl.get("identity", ""), "notes_zh": "",
               "images": images, "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})


def create(name: str, files: list[tuple[str, bytes]]) -> dict:
    if not name.strip():
        raise ValueError("請輸入角色名稱")
    with _lock:
        cid = _new_id()
        images = [{"file": save_png(raw, refs_dir(cid), fname), "use": True} for fname, raw in files]
        return _save({"id": cid, "name": name.strip(), "identity": "", "notes_zh": "", "images": images,
                      "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})


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
        for fname, raw in files:
            c["images"].append({"file": save_png(raw, refs_dir(cid), fname), "use": True})
        return _save(c)


def remove_image(cid: str, file: str) -> dict:
    with _lock:
        c = get(cid)
        if not c:
            raise KeyError(cid)
        move_to_removed(refs_dir(cid) / Path(file).name)
        c["images"] = [i for i in c["images"] if i["file"] != file]
        return _save(c)


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

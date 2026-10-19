"""專案路徑與設定檔讀寫"""
import json
import os
import re
import threading
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent          # 程式碼所在（tools/ 等）
# 資料根目錄：預設就是 repo；測試時用 EMOCHI_ROOT 指到暫存資料夾，不碰真正的資料
ROOT = Path(os.environ["EMOCHI_ROOT"]).resolve() if os.environ.get("EMOCHI_ROOT") else APP_ROOT
# 程式內建的設定（進版控）：prompt_template.json、*.example.json。使用者自己的設定檔在 config_dir()
BUILTIN_CONFIG = ROOT / "config"
OUTPUTS = ROOT / "outputs"      # 不能改位置：Codex 生圖的沙盒只能寫入資料根目錄底下
STATIC = Path(__file__).resolve().parent / "static"


# ---------- 可在設定頁改位置的資料夾（每次呼叫都讀最新設定，改了立即生效） ----------

def _dir(key: str) -> Path:
    from .settings import dir_of   # settings 會 import paths，放這裡避免循環
    return dir_of(key)


def config_dir() -> Path:
    return _dir("config_dir")


def logs_dir() -> Path:
    return _dir("logs_dir")


def exports_dir() -> Path:
    return _dir("exports_dir")


def characters_dir() -> Path:
    return _dir("characters_dir")


def style_lib_dir() -> Path:
    return _dir("style_lib_dir")


def codex_path(p: Path) -> str:
    """給 Codex（-i 參考圖）與畫面顯示用的路徑：在資料根目錄底下就用相對路徑，否則用絕對路徑"""
    p = Path(p).resolve()
    try:
        return p.relative_to(ROOT).as_posix()
    except ValueError:
        return p.as_posix()


# /files/<前綴>/... 的前綴 → 實際資料夾。網址固定用這些前綴，資料夾搬到哪都不用改前端
URL_BASES = {"outputs": lambda: OUTPUTS, "exports": exports_dir, "characters": characters_dir, "style_lib": style_lib_dir}


def url_path(p: Path) -> str | None:
    """實際檔案 → /files/ 後面接的路徑（找不到對應的前綴就回傳 None）"""
    p = Path(p).resolve()
    for prefix, base in URL_BASES.items():
        try:
            return f"{prefix}/{p.relative_to(base().resolve()).as_posix()}"
        except ValueError:
            continue
    return None


def from_url(path: str) -> Path | None:
    """/files/ 後面的路徑 → 實際檔案；擋掉跑出該資料夾的路徑（../）"""
    prefix, _, rest = path.partition("/")
    if prefix not in URL_BASES or not rest:
        return None
    base = URL_BASES[prefix]().resolve()
    p = (base / rest).resolve()
    return p if base in p.parents else None

_lock = threading.Lock()


def read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json(path: Path, data) -> None:
    """先寫暫存檔再替換，避免寫到一半被讀到"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ---------- 貼圖清單 ----------

def load_stickers() -> list[dict]:
    """config/stickers.json 是本地資料（不進版控）；還沒有的話用 stickers.example.json（基礎 32 種）。
    第一次在網頁上新增／編輯／刪除表情時才寫出 stickers.json"""
    items = read_json(config_dir() / "stickers.json")
    return items if items is not None else read_json(BUILTIN_CONFIG / "stickers.example.json", [])


def sticker_map() -> dict[int, dict]:
    return {s["id"]: s for s in load_stickers()}


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s or "emote"


# ---------- 專案編號 ----------

def next_style_id() -> str:
    used = {p.name for p in OUTPUTS.iterdir() if p.is_dir()} if OUTPUTS.exists() else set()
    # logs/ 裡出現過的、垃圾桶裡的、永久刪除過的編號都不重用，免得新專案和舊的 log 混在一起
    logs = logs_dir()
    used |= {p.name for p in logs.iterdir() if p.is_dir()} if logs.exists() else set()
    from .trash import reserved_ids
    used |= reserved_ids("projects")
    n = 1
    while f"s{n}" in used:
        n += 1
    return f"s{n}"

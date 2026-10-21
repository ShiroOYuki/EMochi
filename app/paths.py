"""專案路徑與設定檔讀寫"""

import json
import os
import re
import sys
import threading
from pathlib import Path

# 打包成桌面版（PyInstaller）時，程式和內建檔案解開在 sys._MEIPASS
FROZEN = bool(getattr(sys, "frozen", False))
APP_ROOT = Path(getattr(sys, "_MEIPASS", "")).resolve() if FROZEN else Path(__file__).resolve().parent.parent


def _data_root() -> Path:
    """資料根目錄（settings.local.json、outputs、角色庫…的預設位置）：
    EMOCHI_ROOT（桌面版由 Electron 傳入、測試指到暫存資料夾）＞ 打包版 %LOCALAPPDATA%\\EMochi ＞ 原始碼資料夾（網頁版）"""
    if os.environ.get("EMOCHI_ROOT"):
        return Path(os.environ["EMOCHI_ROOT"]).expanduser().resolve()
    if FROZEN:
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return (Path(base) / "EMochi").resolve()
    return APP_ROOT


ROOT = _data_root()
ROOT.mkdir(parents=True, exist_ok=True)
# 程式內建的設定（進版控、跟著程式走）：prompt_template.json、*.example.json。使用者自己的設定檔在 config_dir()
BUILTIN_CONFIG = APP_ROOT / "config"
STATIC = APP_ROOT / "app" / "static"


# ---------- 可在設定頁改位置的資料夾（每次呼叫都讀最新設定，改了立即生效） ----------


def _dir(key: str) -> Path:
    from .settings import dir_of  # settings 會 import paths，放這裡避免循環

    return dir_of(key)


def outputs_dir() -> Path:
    """畫風專案（網格圖、切好的貼圖、project.json）。放在資料根目錄外時，生圖會加 --add-dir 讓 Codex 能寫入"""
    return _dir("outputs_dir")


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


# ---------- 專案裡記的路徑 ----------
# project.json 裡 outputs 底下的檔案一律記成「outputs/<專案>/...」（邏輯路徑），不記實際位置：
# outputs 資料夾搬走也不用改 project.json，前端直接拿來當 /files/ 網址。要讀檔或交給 Codex 時才換成實際路徑
OUTPUTS_PREFIX = "outputs"


def data_path(s: str) -> Path:
    """project.json 裡記的路徑 → 實際檔案：outputs/... 接到 outputs 資料夾，其他相對資料根目錄（或本來就是絕對路徑）"""
    s = str(s)
    head, _, rest = s.replace("\\", "/").partition("/")
    if head == OUTPUTS_PREFIX:
        return outputs_dir() / rest
    return ROOT / s


def stored_path(p: Path) -> str:
    """實際檔案 → 存進 project.json 的路徑（outputs 底下記邏輯路徑，其他同 codex_path）"""
    p = Path(p).resolve()
    try:
        return f"{OUTPUTS_PREFIX}/{p.relative_to(outputs_dir().resolve()).as_posix()}"
    except ValueError:
        return codex_path(p)


def to_codex(s: str) -> str:
    """project.json 裡記的路徑 → 交給 Codex 的路徑"""
    return codex_path(data_path(s))


def outside_root(p: Path) -> bool:
    p = Path(p).resolve()
    return p != ROOT and ROOT not in p.parents


# /files/<前綴>/... 的前綴 → 實際資料夾。網址固定用這些前綴，資料夾搬到哪都不用改前端
URL_BASES = {
    "outputs": outputs_dir,
    "exports": exports_dir,
    "characters": characters_dir,
    "style_lib": style_lib_dir,
    "sticker_examples": lambda: config_dir() / "sticker_examples",  # 表情範例圖（stickers.examples_dir）
}


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
    out = outputs_dir()
    used = {p.name for p in out.iterdir() if p.is_dir()} if out.exists() else set()
    # logs/ 裡出現過的、垃圾桶裡的、永久刪除過的編號都不重用，免得新專案和舊的 log 混在一起
    logs = logs_dir()
    used |= {p.name for p in logs.iterdir() if p.is_dir()} if logs.exists() else set()
    from .trash import reserved_ids

    used |= reserved_ids("projects")
    n = 1
    while f"s{n}" in used:
        n += 1
    return f"s{n}"

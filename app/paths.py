"""專案路徑與設定檔讀寫"""
import json
import os
import re
import threading
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent          # 程式碼所在（tools/ 等）
# 資料根目錄：預設就是 repo；測試時用 EMOCHI_ROOT 指到暫存資料夾，不碰真正的資料
ROOT = Path(os.environ["EMOCHI_ROOT"]).resolve() if os.environ.get("EMOCHI_ROOT") else APP_ROOT
CONFIG = ROOT / "config"
OUTPUTS = ROOT / "outputs"
EXPORTS = ROOT / "exports"
LOGS = ROOT / "logs"
REFS = ROOT / "refs"
PROMPTS_DIR = ROOT / "prompts"
STATIC = Path(__file__).resolve().parent / "static"

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
    items = read_json(CONFIG / "stickers.json")
    return items if items is not None else read_json(CONFIG / "stickers.example.json", [])


def sticker_map() -> dict[int, dict]:
    return {s["id"]: s for s in load_stickers()}


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s or "emote"


# ---------- 畫風設定 ----------

def load_styles_cfg() -> dict:
    """config/styles.json 是本地資料（不進版控）；還沒有的話用 styles.example.json 當起點"""
    cfg = read_json(CONFIG / "styles.json")
    if cfg is None:
        cfg = read_json(CONFIG / "styles.example.json", {}) or {}
        cfg.setdefault("codex", {"args": ["exec", "--skip-git-repo-check", "-s", "workspace-write"]})
        cfg.setdefault("styles", {})
    return cfg


def save_styles_cfg(cfg: dict) -> None:
    write_json(CONFIG / "styles.json", cfg)


def next_style_id() -> str:
    used = {p.name for p in OUTPUTS.iterdir() if p.is_dir()} if OUTPUTS.exists() else set()
    used |= set(load_styles_cfg().get("styles", {}))
    # 垃圾桶裡的、永久刪除過的編號都不重用，免得和舊的 logs/、prompts/ 混在一起
    from .trash import reserved_ids
    used |= reserved_ids("projects")
    n = 1
    while f"s{n}" in used:
        n += 1
    return f"s{n}"

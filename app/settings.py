"""程式設定：<資料根目錄>/settings.local.json（不進版控）

位置固定，不能被設定改走（設定頁之後會在這裡加路徑、同時生圖數等）。檔案不存在或缺欄位時用 DEFAULTS。
"""
import threading

from .paths import ROOT, read_json, write_json

FILE = ROOT / "settings.local.json"
DEFAULTS: dict = {
    # codex exec 的參數（生圖用；文字任務另外固定用唯讀沙盒）
    "codex_args": ["exec", "--skip-git-repo-check", "-s", "workspace-write"],
}
_lock = threading.Lock()


def load() -> dict:
    data = read_json(FILE, {}) or {}
    return {**DEFAULTS, **{k: v for k, v in data.items() if k in DEFAULTS}}


def get(key: str):
    return load()[key]


def update(changes: dict) -> dict:
    with _lock:
        data = read_json(FILE, {}) or {}
        data.update({k: v for k, v in changes.items() if k in DEFAULTS})
        write_json(FILE, data)
        return load()

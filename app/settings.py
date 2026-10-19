"""程式設定：<資料根目錄>/settings.local.json（不進版控）

設定檔本身的位置固定，不能被設定改走。檔案不存在或缺欄位時用 DEFAULTS；改了立即生效（每次用到都重讀）。

資料夾設定（DIRS）一律用完整路徑（使用者要求 2026-10-19）；預設值是資料根目錄底下的同名資料夾。
outputs 放在資料根目錄外時，生圖會加 --add-dir 讓 Codex 的沙盒能寫入（2026-10-19 實測可行）。
"""
import threading
from pathlib import Path

from .paths import ROOT, read_json, write_json

FILE = ROOT / "settings.local.json"

# 可以自訂位置的資料夾：key → (預設, 名稱, 說明)
DIRS: dict[str, tuple[str, str, str]] = {
    "outputs_dir": ("outputs", "專案輸出資料夾", "每個畫風專案的網格圖、切好的貼圖與 project.json（含垃圾桶）；檔案最多"),
    "logs_dir": ("logs", "Log 資料夾", "每次呼叫 Codex 的紀錄；Codex 狀態的用量統計從這裡算"),
    "config_dir": ("config", "設定檔資料夾", "你的表情清單、分組與匯出預設集（stickers.json、sticker_groups.json、export_presets.json）"),
    "exports_dir": ("exports", "匯出資料夾", "Gallery 匯出的 zip、總覽圖與勾選清單"),
    "characters_dir": ("characters", "角色庫", "每個角色的參考圖與特徵（含垃圾桶）"),
    "style_lib_dir": ("style_lib", "畫風庫", "每個畫風的描述與範例圖（含垃圾桶）"),
}
LAYOUTS = ("4x2w", "3x2")
THEMES = ("system", "light", "dark")
DEFAULTS: dict = {
    **{k: v[0] for k, v in DIRS.items()},
    "max_parallel": 3,             # 同時生圖組數（1～3）
    "default_layout": "4x2w",      # Gen 挑選步驟預設的網格版型
    "image_timeout_min": 20,       # 單組生圖逾時（分鐘）
    "text_timeout_min": 5,         # 文字任務（擴寫、看圖寫特徵、分析畫風）逾時（分鐘）
    "theme": "system",             # 介面主題：system（跟隨系統）／light／dark；Navbar 切換或設定頁改，立即存檔
    # codex exec 的參數（生圖用）；設定頁只顯示不給改，改錯會讓 Codex 沒辦法寫入
    "codex_args": ["exec", "--skip-git-repo-check", "-s", "workspace-write"],
}
LIMITS = {"max_parallel": (1, 3), "image_timeout_min": (3, 120), "text_timeout_min": (1, 30)}
_lock = threading.Lock()
_cache: dict = {"sig": None, "data": None}


def _sig():
    try:
        st = FILE.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def load() -> dict:
    """每次都要用到最新值，但不想每次讀檔：用檔案的 (mtime, size) 當快取鍵"""
    sig = _sig()
    if _cache["data"] is not None and _cache["sig"] == sig:
        return dict(_cache["data"])
    data = read_json(FILE, {}) or {}
    out = {**DEFAULTS, **{k: v for k, v in data.items() if k in DEFAULTS}}
    _cache.update(sig=sig, data=out)
    return dict(out)


def get(key: str):
    return load()[key]


def resolve(value: str) -> Path:
    """設定值 → 實際路徑。畫面上只收完整路徑；相對路徑只出現在 DEFAULTS（接在資料根目錄後面）"""
    p = Path(str(value).strip())
    return (p if p.is_absolute() else ROOT / p).resolve()


def default_dir(key: str) -> Path:
    return resolve(DEFAULTS[key])


def dir_of(key: str) -> Path:
    return resolve(get(key))


def validate(changes: dict) -> dict:
    """檢查非路徑類的值；回傳整理過的 changes，不合法就丟 ValueError"""
    out = {}
    for k, v in changes.items():
        if k not in DEFAULTS or k == "codex_args":
            continue
        if k in DIRS:
            v = str(v or "").strip()
            if not v:
                v = str(default_dir(k))
            elif not Path(v).is_absolute():
                raise ValueError(f"{DIRS[k][1]}請填完整路徑（例如 D:\\EMochiData\\{DEFAULTS[k]}）")
            v = str(resolve(v))
        elif k in LIMITS:
            lo, hi = LIMITS[k]
            try:
                v = int(v)
            except (TypeError, ValueError):
                raise ValueError(f"{k} 要填數字") from None
            if not lo <= v <= hi:
                raise ValueError(f"{k} 要在 {lo}～{hi} 之間")
        elif k == "default_layout" and v not in LAYOUTS:
            raise ValueError(f"不支援的版型 {v}")
        elif k == "theme" and v not in THEMES:
            raise ValueError(f"不支援的主題 {v}")
        out[k] = v
    return out


def save(changes: dict) -> dict:
    with _lock:
        data = read_json(FILE, {}) or {}
        data.update(changes)
        # 和預設一樣的就不寫進檔案，檔案只留真的改過的（資料夾比對實際路徑）
        def same(k, v):
            return resolve(v) == default_dir(k) if k in DIRS else v == DEFAULTS[k]
        data = {k: v for k, v in data.items() if k in DEFAULTS and not same(k, v)}
        write_json(FILE, data)
        _cache["sig"] = None
        return load()


def update(changes: dict) -> dict:
    """舊介面（測試、codex_args 用）：不檢查直接存"""
    return save({k: v for k, v in changes.items() if k in DEFAULTS})

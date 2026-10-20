"""共用：介面偏好、健康檢查、Codex 狀態與登入、回報問題的診斷資訊"""

from fastapi import APIRouter
from pydantic import BaseModel

from .. import codex, codex_status, diagnostics, events, settings, settings_ops, usage
from ..paths import FROZEN, ROOT, logs_dir, read_json

router = APIRouter()


class UiPrefs(BaseModel):
    theme: str | None = None
    tour_done: bool | None = None
    notify: bool | None = None


@router.get("/api/ui-prefs")
def get_ui_prefs():
    """介面偏好（主題）：存在 settings.local.json，不放瀏覽器的 localStorage——
    桌面版、不同 port、清快取都不會遺失。前端一載入就讀"""
    # stored：設定檔裡有沒有存過（沒有＝還是預設）。前端用來把舊版存在瀏覽器裡的選擇搬上來
    stored = "theme" in (read_json(settings.FILE, {}) or {})
    return {
        "theme": settings.get("theme"),
        "stored": stored,
        "tour_done": settings.get("tour_done"),
        "notify": settings.get("notify"),
    }


@router.put("/api/ui-prefs")
def put_ui_prefs(body: UiPrefs):
    settings.save(settings.validate(body.model_dump(exclude_none=True)))
    return get_ui_prefs()


@router.get("/api/events")
def get_events(after: int = -1, boot: str | None = None):
    """桌面通知：前端每幾秒帶上次的 seq 來拿新事件（見 events.py）"""
    return events.since(after, boot)


@router.get("/api/health")
def health():
    """桌面版（Electron）用：啟動時等它回應才開視窗；關閉前看有沒有 Codex 在跑"""
    return {
        "ok": True,
        "root": str(ROOT),
        "frozen": FROZEN,
        "codex_running": len(codex.ACTIVE),
        "busy": settings_ops.busy(),
    }


@router.get("/api/codex-usage")
def codex_usage(refresh: bool = False):
    return usage.rate_limits(force=refresh)


@router.get("/api/codex-status")
def get_codex_status(refresh: bool = False):
    """Codex 狀態對話框：連線、登入、額度、執行中、近 7 天 token；refresh＝重新連線（重查 CLI／登入／額度）"""
    return codex_status.status(force=refresh)


@router.get("/api/codex-check")
def get_codex_check(refresh: bool = False):
    """只查 CLI 與登入（不統計用量）：啟動時的 Codex 準備視窗用；refresh＝跳過 60 秒快取重查"""
    return codex_status.check(force=refresh)


@router.get("/api/diagnostics")
def get_diagnostics(app_version: str | None = None, desktop: bool = False):
    """回報問題用的診斷資訊（版本、系統、Codex、設定摘要、最近失敗的呼叫）；家目錄換成 ~"""
    return diagnostics.collect(app_version, desktop)


@router.get("/api/logs-dir")
def get_logs_dir():
    return {"path": str(logs_dir())}


@router.post("/api/codex-login")
def codex_login():
    return codex_status.start_login()

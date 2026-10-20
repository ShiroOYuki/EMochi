"""回報問題用的診斷資訊：版本、系統、Codex 狀態、設定摘要、最近失敗的 Codex 呼叫

只在使用者按「複製診斷資訊」或「回報問題」時產生，不會自動送出。
路徑裡的使用者家目錄換成 ~（避免把 Windows 帳號名稱貼到公開的 issue）。
"""
import json
import platform
import sys
from pathlib import Path

from . import codex_status, settings
from .paths import APP_ROOT, FROZEN, ROOT

RECENT_FAILED = 5


def mask(text: str) -> str:
    home = str(Path.home())
    if not home or home in ("/", "\\"):
        return text
    out = text.replace(home, "~")
    return out.replace(home.replace("\\", "/"), "~")


def source_version() -> str | None:
    """網頁版（原始碼執行）讀 desktop/package.json 的版本；打包版由前端帶桌面殼的版本"""
    try:
        return json.loads((APP_ROOT / "desktop" / "package.json").read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError):
        return None


def os_name() -> str:
    if sys.platform == "win32":
        v = sys.getwindowsversion()
        name = "Windows 11" if v.build >= 22000 else f"Windows {platform.release()}"
        return f"{name}（build {v.build}）"
    return platform.platform()


def collect(app_version: str | None = None, desktop: bool = False) -> dict:
    c = codex_status.check()
    cli = c["cli"]
    codex = (cli.get("version") or "版本不明") if cli["found"] else "找不到 Codex CLI"
    codex_full = f"{codex}・{'已登入' if c['login']['ok'] else '未登入'}" if cli["found"] else codex
    version = app_version or source_version() or "不明"
    mode = "桌面版" if desktop else "網頁版"
    if not FROZEN:
        mode += "・原始碼執行"
    s = settings.load()
    try:
        failed = [r for r in codex_status.usage_days()["recent"] if r["result"] in ("failed", "timeout", "unknown")][:RECENT_FAILED]
    except Exception:  # noqa: BLE001  統計壞掉不影響回報
        failed = []

    lines = [
        f"EMochi：v{version}（{mode}）",
        f"系統：{os_name()}",
        f"Python：{platform.python_version()}",
        f"Codex：{codex_full}",
        f"資料夾：{mask(str(ROOT))}",
        f"設定：同時生圖 {s['max_parallel']} 組、預設版型 {s['default_layout']}、"
        f"生圖逾時 {s['image_timeout_min']} 分、文字逾時 {s['text_timeout_min']} 分",
    ]
    if failed:
        lines.append(f"最近失敗的 Codex 呼叫（近 7 天，最多 {RECENT_FAILED} 筆）：")
        for r in failed:
            lines.append(f"  - {r['time']} {r['scope_label']}・{r['kind']} {r['name']}：{r['result']}（log：{mask(r['log'])}）")
    else:
        lines.append("最近失敗的 Codex 呼叫：近 7 天沒有")
    return {
        "version": version, "os": os_name(), "codex": codex_full, "mode": mode,
        "text": "\n".join(lines),
    }

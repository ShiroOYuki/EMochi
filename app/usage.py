"""Codex 用量：每張圖花掉的 token、ChatGPT 方案的額度百分比

- token：codex exec 結束時會在輸出最後印「tokens used\\n24,805」，我們的 log 就是它的輸出，直接抓
- 額度：Codex 會把每個 session 存成 ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl，
  裡面的 token_count 事件帶 rate_limits（primary＝5 小時窗口、secondary＝每週窗口）。
  取最新一筆，所以只有 Codex 跑過之後才會更新（在別處用 Codex 也算）。
  --ephemeral 的文字任務不會留 session 檔，不影響。
"""
import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

_TOKENS_RE = re.compile(r"tokens used\s*[:\n]\s*([\d,]+)", re.I)
_tok_cache: dict[str, tuple[float, int | None]] = {}
_rl_cache: dict = {"at": 0.0, "data": None}
_lock = threading.Lock()
RL_TTL = 10          # 秒；前端每 30 秒問一次，避免多分頁重複掃檔
SCAN_FILES = 30      # 只看最新的幾個 session 檔
TAIL_BYTES = 512 * 1024


def tokens_from_log(path: Path) -> int | None:
    """log 裡最後一次「tokens used」的數字；沒有（被中斷、逾時）回傳 None"""
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    key = str(path)
    hit = _tok_cache.get(key)
    if hit and hit[0] == mtime:
        return hit[1]
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - 64 * 1024))
            text = f.read().decode("utf-8", errors="replace")
        m = _TOKENS_RE.findall(text)
        val = int(m[-1].replace(",", "")) if m else None
    except OSError:
        val = None
    _tok_cache[key] = (mtime, val)
    return val


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def _ts(v) -> float | None:
    """ISO 字串或 unix 秒 → unix 秒"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _window(w: dict | None, event_ts: float | None) -> dict | None:
    if not isinstance(w, dict) or w.get("used_percent") is None:
        return None
    resets = _ts(w.get("resets_at"))
    if resets is None and w.get("resets_in_seconds") is not None and event_ts is not None:
        resets = event_ts + float(w["resets_in_seconds"])
    return {"used_percent": float(w["used_percent"]),
            "window_minutes": w.get("window_minutes"),
            "resets_at": resets}


def _find_rate_limits(path: Path) -> dict | None:
    """從檔尾往前找最後一筆帶 rate_limits 的 token_count；圖片 session 檔可能很大，先只讀尾巴"""
    size = path.stat().st_size
    for tail in (TAIL_BYTES, size):
        with open(path, "rb") as f:
            f.seek(max(0, size - tail))
            lines = f.read().decode("utf-8", errors="replace").splitlines()
        if tail < size:
            lines = lines[1:]      # 第一行可能被切一半
        for line in reversed(lines):
            if '"rate_limits"' not in line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                continue
            pl = o.get("payload") or o.get("msg") or o
            if pl.get("type") != "token_count" or not pl.get("rate_limits"):
                continue
            rl = pl["rate_limits"]
            ets = _ts(o.get("timestamp")) or path.stat().st_mtime
            prim, sec = _window(rl.get("primary"), ets), _window(rl.get("secondary"), ets)
            if prim or sec:
                return {"primary": prim, "secondary": sec, "plan_type": rl.get("plan_type"),
                        "updated": ets, "source": path.name}
        if tail >= size:
            break
    return None


def rate_limits(force: bool = False) -> dict:
    """force=True：跳過快取重新掃（Navbar 的刷新按鈕）"""
    with _lock:
        if not force and time.time() - _rl_cache["at"] < RL_TTL and _rl_cache["data"] is not None:
            return _rl_cache["data"]
        data = {"available": False, "primary": None, "secondary": None, "plan_type": None,
                "updated": None, "message": ""}
        root = codex_home() / "sessions"
        try:
            files = sorted(root.rglob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:SCAN_FILES]
        except OSError:
            files = []
        if not files:
            data["message"] = f"找不到 Codex session 記錄（{root}）"
        for f in files:
            try:
                found = _find_rate_limits(f)
            except OSError:
                continue
            if found:
                data.update(found, available=True)
                break
        else:
            if files:
                data["message"] = "最近的 session 記錄裡沒有額度資訊，跑一次 Codex 後會更新"
        data["now"] = datetime.now(timezone.utc).timestamp()
        _rl_cache.update(at=time.time(), data=data)
        return data

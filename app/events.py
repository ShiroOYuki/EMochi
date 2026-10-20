"""給前端的事件（目前只有桌面通知用）：生圖完成／失敗時記一筆，前端定時來拿新的

只存在記憶體、最多 100 筆。boot 是這次啟動的代號：伺服器重開後 seq 從 0 算起，
前端看到 boot 變了就只同步 seq、不補發舊事件，避免重開 App 時一次跳一堆通知。
"""
import threading
import time
import uuid
from collections import deque

BOOT = uuid.uuid4().hex[:8]
_lock = threading.Lock()
_events: deque[dict] = deque(maxlen=100)
_seq = 0


def emit(kind: str, project: str, title: str, body: str = "", ok: bool = True) -> dict:
    """kind：preview（預覽圖）／batch（整批生成跑完）；project：專案編號（點通知時打開它）"""
    global _seq
    with _lock:
        _seq += 1
        ev = {"seq": _seq, "kind": kind, "project": project, "title": title, "body": body, "ok": ok, "time": time.time()}
        _events.append(ev)
        return ev


def since(after: int = -1, boot: str | None = None) -> dict:
    """after < 0 或 boot 對不上（第一次來、伺服器重開過）：只回目前的 seq，不給舊事件"""
    with _lock:
        if after < 0 or boot != BOOT:
            return {"boot": BOOT, "seq": _seq, "events": []}
        return {"boot": BOOT, "seq": _seq, "events": [e for e in _events if e["seq"] > after]}


def reset() -> None:
    """測試用"""
    global _seq
    with _lock:
        _events.clear()
        _seq = 0

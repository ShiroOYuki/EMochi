"""後端程式的 log：<logs_dir>/app.log（WARNING 以上，另外印到 console）

每寫一筆才開檔、寫完就關：logs 資料夾可以在設定頁搬家，開著的檔案在 Windows 上搬不動；
log 量很少（只有警告和錯誤），每次開關檔不影響效能。超過 1 MB 輪替成 app.log.1、app.log.2。
各模組用 logging.getLogger(__name__)（名稱都在 "app." 底下）。回報問題時 diagnostics 會附上最後幾行。
"""

import logging
import os
from collections import deque

from .paths import logs_dir

MAX_BYTES = 1_000_000
BACKUPS = 2
FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def log_path():
    return logs_dir() / "app.log"


class _AppLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record) + "\n"
            path = log_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists() and path.stat().st_size > MAX_BYTES:
                for i in range(BACKUPS, 0, -1):
                    src = path if i == 1 else path.with_name(f"{path.name}.{i - 1}")
                    if src.exists():
                        os.replace(src, path.with_name(f"{path.name}.{i}"))
            with open(path, "a", encoding="utf-8") as f:
                f.write(msg)
        except Exception:  # noqa: BLE001
            self.handleError(record)


def setup() -> None:
    """程式啟動時呼叫一次（app/__main__.py）；測試不呼叫，不會寫檔"""
    fmt = logging.Formatter(FORMAT)
    file_handler = _AppLogHandler(logging.WARNING)
    file_handler.setFormatter(fmt)
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    for name in ("app", "uvicorn.error"):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)
        logger.addHandler(file_handler)
        if name == "app":
            logger.addHandler(console)


def tail(n: int = 20) -> list[str]:
    """app.log 最後 n 行（沒有檔案就是空的）"""
    try:
        with open(log_path(), encoding="utf-8", errors="replace") as f:
            return [line.rstrip("\n") for line in deque(f, maxlen=n)]
    except OSError:
        return []

"""uv run python -m app  →  http://127.0.0.1:8765

桌面版（Electron）會這樣啟動：--port <空的 port> --no-browser --parent-pid <Electron 的 pid>
"""

import argparse
import os
import sys
import threading
import time
import webbrowser

import uvicorn


def _alive(pid: int) -> bool:
    """不能用 os.kill(pid, 0)：Windows 上那會直接結束對方"""
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    import ctypes

    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
    if not h:
        return False
    try:
        return k32.WaitForSingleObject(h, 0) == 0x00000102  # WAIT_TIMEOUT＝還在跑
    finally:
        k32.CloseHandle(h)


def _watch_parent(pid: int) -> None:
    """Electron 意外結束（當掉、被工作管理員關掉）時，跟著收掉正在跑的 Codex 再結束自己，不留孤兒程序"""

    def loop():
        while _alive(pid):
            time.sleep(2)
        from . import codex

        for info in list(codex.ACTIVE.values()):
            codex.kill_pid_tree(info["pid"])
        os._exit(0)

    threading.Thread(target=loop, daemon=True).start()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--parent-pid", type=int, default=0)
    a = ap.parse_args()
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    from . import applog
    from .server import app  # 直接傳物件（不用 "app.server:app" 字串），打包後也找得到

    applog.setup()

    url = f"http://127.0.0.1:{a.port}"
    print(f"EMochi 已啟動：{url}（Ctrl+C 結束）", flush=True)
    if a.parent_pid:
        _watch_parent(a.parent_pid)
    if not a.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")


if __name__ == "__main__":
    main()

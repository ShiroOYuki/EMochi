"""執行 Codex CLI：生圖（$imagegen）與文字擴寫兩種用途

Codex 偶爾會「圖已經存好、程序卻不結束」（s5 第 1 組就卡過），
所以這裡用輪詢監看，而不是單純 wait()：
  - 程序自己結束 → 正常收尾
  - generation_finished() 判定已完成 → 主動結束整個程序樹
  - 超過 timeout → 結束並標記失敗
"""
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from .paths import LOGS, ROOT, load_styles_cfg

POLL_SEC = 3
DEFAULT_TIMEOUT = 20 * 60
KEY_COLORS = {"#00FF00": (0, 255, 0), "#FF00FF": (255, 0, 255)}


def codex_bin() -> str:
    exe = shutil.which("codex")
    if not exe:
        raise RuntimeError("找不到 codex 指令，請確認 Codex CLI 已安裝並在 PATH 中")
    return exe


def kill_tree(proc: subprocess.Popen) -> None:
    """Windows 上 codex 是由 codex.cmd 啟動，只 kill 外殼不會停到真正的程序"""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        proc.kill()


def generation_finished(out_path: Path, started_at: float, log_text: str) -> bool:
    """程序還沒結束時，判斷 Codex 是否「其實已經做完」，可以主動收掉。

    out_path   預期的輸出圖片（可能還不存在、可能是舊圖、可能正被寫入）
    started_at 這次啟動的 time.time()
    log_text   到目前為止的 Codex 輸出（含 "Saved"、"refinement pass" 等字樣）

    回傳 True → 呼叫端會結束整個程序樹，接著做 check_image() 驗證。
    回傳 False → 繼續等（最後仍有 timeout 保底）。

    TODO(你來決定)：目前只回傳 False，等於「完全信任 Codex 自己結束」。
    注意 Codex 常先存一版、再做一輪修飾覆蓋同一個檔案，太早判定會拿到修飾前的版本。
    """
    return False


def check_image(out_path: Path, started_at: float, layout: str) -> tuple[bool, str]:
    """檔案是這次寫的、比例符合版型、四角是去背用的純色"""
    if not out_path.exists():
        return False, "沒有產生檔案"
    if out_path.stat().st_mtime < started_at - 1:
        return False, "檔案沒有更新（仍是舊圖）"
    try:
        from PIL import Image
        im = Image.open(out_path).convert("RGB")
    except Exception as e:
        return False, f"無法開啟圖片：{e}"
    w, h = im.size
    ratio = w / h
    lo, hi = (1.3, 1.8) if layout == "4x2" else (0.85, 1.18)
    if not lo <= ratio <= hi:
        return False, f"比例 {w}x{h} 不符合 {layout} 版型"
    pad, box = int(min(w, h) * 0.01), max(4, int(min(w, h) * 0.03))
    corners = [(pad, pad), (w - pad - box, pad), (pad, h - pad - box), (w - pad - box, h - pad - box)]
    means = [tuple(sum(c) / len(c) for c in zip(*im.crop((x, y, x + box, y + box)).getdata()))
             for x, y in corners]
    for name, key in KEY_COLORS.items():
        if all(sum((a - b) ** 2 for a, b in zip(m, key)) ** 0.5 < 60 for m in means):
            return True, f"OK（{w}x{h}，背景 {name}）"
    return False, "四角不是純綠 / 洋紅背景，去背可能失敗"


def _run(cmd: list[str], stdin_text: str, log_path: Path, *, watch=None, timeout=DEFAULT_TIMEOUT,
         on_tick=None) -> tuple[int | None, str]:
    """啟動 codex 並輪詢；watch(log_text) 回傳 True 時主動結束。回傳 (exit code 或 None, 結束原因)"""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as log:
        log.write(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] start\n{' '.join(cmd)}\n\n")
        log.flush()
        proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.PIPE, stdout=log,
                                stderr=subprocess.STDOUT,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        proc.stdin.write(stdin_text.encode("utf-8"))
        proc.stdin.close()
        started = time.time()
        reason = "exit"
        while proc.poll() is None:
            time.sleep(POLL_SEC)
            if on_tick:
                on_tick(proc)
            if time.time() - started > timeout:
                reason = "timeout"
                kill_tree(proc)
                break
            if watch:
                try:
                    text = log_path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    text = ""
                if watch(text):
                    reason = "finished-early"
                    kill_tree(proc)
                    break
        code = proc.wait()
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}] {reason} exit={code}\n")
    return code, reason


def run_image(prompt: str, refs: list[str], out_rel: str, layout: str, log_path: Path,
              on_tick=None) -> tuple[bool, str]:
    cfg = load_styles_cfg()
    cmd = [codex_bin(), *cfg.get("codex", {}).get("args", ["exec", "--skip-git-repo-check", "-s", "workspace-write"])]
    for r in refs:
        cmd += ["-i", r]
    cmd.append("-")
    out_path = ROOT / out_rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    code, reason = _run(cmd, prompt, log_path, on_tick=on_tick,
                        watch=lambda text: generation_finished(out_path, started, text))
    ok, why = check_image(out_path, started, layout)
    if reason == "timeout" and not ok:
        return False, "逾時（超過 20 分鐘）"
    if not ok:
        return False, why if code == 0 or reason != "exit" else f"codex 結束碼 {code}；{why}"
    return True, why


def run_text(prompt: str, schema_path: Path, log_path: Path, timeout: int = 5 * 60,
             images: list[str] | None = None) -> str:
    """不生圖、只要文字（JSON）回覆：唯讀沙盒、不留 session；images 可附參考圖讓 Codex 看"""
    out = log_path.with_suffix(".answer.json")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    cmd = [codex_bin(), "exec", "--skip-git-repo-check", "-s", "read-only", "--ephemeral",
           "--output-schema", str(schema_path), "-o", str(out)]
    for img in images or []:
        cmd += ["-i", img]
    cmd.append("-")
    code, reason = _run(cmd, prompt, log_path, timeout=timeout)
    if not out.exists():
        raise RuntimeError(f"Codex 沒有回覆（{reason}, exit={code}），請看 {log_path.relative_to(ROOT)}")
    return out.read_text(encoding="utf-8")


def log_path_for(style: str, name: str) -> Path:
    return LOGS / style / f"{name}_{datetime.now():%Y%m%d_%H%M%S}.log"

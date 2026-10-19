"""執行 Codex CLI：生圖（$imagegen）與文字擴寫兩種用途

Codex 偶爾會「圖已經存好、程序卻不結束」（s5 第 1 組就卡過），
所以這裡用輪詢監看，而不是單純 wait()：
  - 程序自己結束 → 正常收尾
  - generation_finished() 判定已完成 → 主動結束整個程序樹
  - 超過 timeout → 結束並標記失敗
"""
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from .paths import LOGS, ROOT, load_styles_cfg

POLL_SEC = 3
# 目前正在跑的 Codex（給「Codex 狀態」對話框看）：log 路徑 → {pid, started}
ACTIVE: dict[str, dict] = {}
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


TURN_DONE = re.compile(r"^tokens used\s*\n\s*[\d,]+\s*$", re.M)
FINISH_GRACE_SEC = 15   # 判定做完後，再給 Codex 這麼久自己結束；還不結束才收掉


def generation_finished(out_path: Path, started_at: float, log_text: str, state: dict,
                        layout: str | None = None, now: float | None = None) -> bool:
    """程序還沒結束時，判斷 Codex 是否「其實已經做完」，可以主動收掉。

    out_path   預期的輸出圖片（可能還不存在、可能是舊圖、可能正被寫入）
    started_at 這次啟動的 time.time()
    log_text   到目前為止的 Codex 輸出
    state      呼叫端每次傳同一個 dict，用來記上一輪看到的檔案狀態
    回傳 True → 呼叫端會結束整個程序樹，接著做 check_image() 驗證；False → 繼續等（仍有 timeout 保底）

    判定條件（全部成立才收）：
    1. log 已經出現 Codex 收尾的「tokens used ＋ 數字」：這行只在整個回合結束時才印。
       中途的「Saved: ...」不算數，因為 Codex 常先存一版、再做一輪修飾（例如統一綠幕）覆蓋同一個檔案
    2. 圖是這次寫的，而且連續兩輪大小、修改時間都沒變（不是寫到一半）
    3. 圖本身通過 check_image()（比例、背景）
    4. 從第 1 點成立起，已經多等了 FINISH_GRACE_SEC 秒，Codex 還是沒自己結束
    """
    now = time.time() if now is None else now
    if not TURN_DONE.search(log_text):
        return False
    state.setdefault("done_at", now)
    try:
        st = out_path.stat()
    except OSError:
        return False
    if st.st_mtime < started_at - 1:
        return False
    sig = (st.st_size, st.st_mtime_ns)
    stable = state.get("sig") == sig
    state["sig"] = sig
    if not stable or now - state["done_at"] < FINISH_GRACE_SEC:
        return False
    if "checked" not in state:   # 圖沒變就只驗一次
        state["checked"] = check_image(out_path, started_at, layout or "1x1")[0]
    return state["checked"]


GRID = {"1x1": (1, 1), "2x2": (2, 2), "3x2": (3, 2), "4x2": (4, 2), "4x2w": (4, 2)}
RATIO = {"3x2": (1.3, 1.8), "4x2": (1.3, 1.8), "4x2w": (1.8, 2.25)}   # 其他（方形）：0.85～1.18


def background_stats(im, layout: str) -> dict:
    """量背景：格子之間的走道、外框一圈、全圖，各有多少比例是去背用的純色。

    不再只看四個角：特寫構圖的頭髮本來就會被上緣裁切，上面兩個角常常是頭髮，
    但只要格子之間的走道是乾淨的純色，切割和去背就沒問題。"""
    import numpy as np
    small = im.convert("RGB").resize((512, max(1, round(512 * im.height / im.width))))
    a = np.asarray(small, dtype=np.int16)
    h, w, _ = a.shape
    cols, rows = GRID.get(layout, (1, 1))
    band, t = max(2, round(min(w, h) * 0.01)), max(2, round(min(w, h) * 0.02))
    best = None
    for name, key in KEY_COLORS.items():
        near = np.sqrt(((a - key) ** 2).sum(-1)) < 80
        strips = [near[:, round(w * c / cols) - band: round(w * c / cols) + band] for c in range(1, cols)]
        strips += [near[round(h * r / rows) - band: round(h * r / rows) + band, :] for r in range(1, rows)]
        ring = np.concatenate([near[:t].ravel(), near[-t:].ravel(), near[:, :t].ravel(), near[:, -t:].ravel()])
        st = {"key": name, "gutter": float(np.mean([x.mean() for x in strips])) if strips else None,
              "ring": float(ring.mean()), "all": float(near.mean())}
        if best is None or st["all"] > best["all"]:
            best = st
    return best


def background_ok(st: dict) -> tuple[bool, str]:
    """門檻用 s1～s5 的實際網格（9 張抽樣）校準：正常圖走道 ≥ 0.88、外框 ≥ 0.43；白底、漸層底都在 0.35 以下"""
    if st["gutter"] is not None:
        ok = st["gutter"] >= 0.7 and st["ring"] >= 0.25
        why = f"格子間走道只有 {st['gutter']:.0%} 是純色背景"
    else:   # 單張沒有走道，看外框
        ok = st["ring"] >= 0.3 or st["all"] >= 0.2
        why = f"外框只有 {st['ring']:.0%} 是純色背景"
    return ok, "" if ok else f"背景不是純綠 / 洋紅（{why}），去背可能失敗"


def check_image(out_path: Path, started_at: float | None, layout: str) -> tuple[bool, str]:
    """檔案是這次寫的（started_at=None 時不檢查）、比例符合版型、背景是去背用的純色"""
    if not out_path.exists():
        return False, "沒有產生檔案"
    if started_at is not None and out_path.stat().st_mtime < started_at - 1:
        return False, "檔案沒有更新（仍是舊圖）"
    try:
        from PIL import Image
        im = Image.open(out_path)
        im.load()
    except Exception as e:
        return False, f"無法開啟圖片：{e}"
    w, h = im.size
    lo, hi = RATIO.get(layout, (0.85, 1.18))
    if not lo <= w / h <= hi:
        return False, f"比例 {w}x{h} 不符合 {layout} 版型"
    st = background_stats(im, layout)
    ok, msg = background_ok(st)
    if not ok:
        return False, msg
    return True, f"OK（{w}x{h}，背景 {st['key']}）"


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
        ACTIVE[str(log_path)] = {"pid": proc.pid, "started": started}
        try:
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
        finally:
            ACTIVE.pop(str(log_path), None)
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
    state: dict = {}
    code, reason = _run(cmd, prompt, log_path, on_tick=on_tick,
                        watch=lambda text: generation_finished(out_path, started, text, state, layout))
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

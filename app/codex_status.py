"""「Codex 狀態」對話框的資料：連線（CLI、登入）、額度、執行中的工作、近 7 天這個專案用掉的 token

token 統計直接讀 logs/：每次呼叫 Codex 都會留一個 logs/<範圍>/<名稱>_YYYYmmdd_HHMMSS.log，
結尾有「tokens used\\n<數字>」與「[時間] exit|timeout|finished-early exit=<code>」。
logs/legacy/、logs/_test/ 是舊格式或測試用，不算。
"""
import re
import subprocess
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from . import codex, usage
from .paths import LOGS, OUTPUTS, ROOT, load_styles_cfg, read_json

CHECK_TTL = 60          # 秒；CLI 版本、登入狀態不常變，沒按「重新連線」就用快取
DAYS = 7
RECENT = 12
SKIP_DIRS = {"legacy", "_test"}
NAME_RE = re.compile(r"^(?P<name>.+)_(?P<ts>\d{8}_\d{6})\.log$")
END_RE = re.compile(r"^\[(?P<ts>[\d\- :]+)\] (?P<reason>[\w-]+) exit=(?P<code>-?\d+|None)\s*$", re.M)

_check = {"at": 0.0, "data": None}
_lock = threading.Lock()
_login_proc: subprocess.Popen | None = None


def _cmd(args: list[str], timeout: int = 20) -> tuple[int | None, str]:
    try:
        r = subprocess.run(args, capture_output=True, timeout=timeout, cwd=ROOT,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        out = (r.stdout + r.stderr).decode("utf-8", errors="replace").strip()
        return r.returncode, out
    except subprocess.TimeoutExpired:
        return None, f"逾時（{timeout} 秒沒有回應）"
    except OSError as e:
        return None, str(e)


def check(force: bool = False) -> dict:
    """CLI 在不在、版本、登入狀態；force＝「重新連線」按鈕"""
    with _lock:
        if not force and _check["data"] and time.time() - _check["at"] < CHECK_TTL:
            return _check["data"]
        data = {"cli": {"found": False, "path": None, "version": None},
                "login": {"ok": False, "text": "", "pending": False}}
        try:
            exe = codex.codex_bin()
        except RuntimeError as e:
            data["cli"]["error"] = str(e)
            data["login"]["text"] = "找不到 Codex CLI，無法檢查登入"
        else:
            data["cli"].update(found=True, path=exe)
            code, out = _cmd([exe, "--version"])
            data["cli"]["version"] = out.splitlines()[-1] if code == 0 and out else None
            if code != 0:
                data["cli"]["error"] = out or f"結束碼 {code}"
            code, out = _cmd([exe, "login", "status"])
            data["login"].update(ok=code == 0, text=out.splitlines()[-1] if out else f"結束碼 {code}")
        data["login"]["pending"] = _login_proc is not None and _login_proc.poll() is None
        data["checked_at"] = time.time()
        _check.update(at=time.time(), data=data)
        return data


def start_login() -> dict:
    """在這台電腦上執行 codex login（會打開瀏覽器讓使用者登入 ChatGPT）；不等它結束"""
    global _login_proc
    if _login_proc is not None and _login_proc.poll() is None:
        return {"started": False, "message": "登入流程已經在進行中，請到瀏覽器完成登入"}
    exe = codex.codex_bin()
    log = LOGS / "codex_login.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    with open(log, "w", encoding="utf-8") as f:
        _login_proc = subprocess.Popen([exe, "login"], cwd=ROOT, stdout=f, stderr=subprocess.STDOUT,
                                       stdin=subprocess.DEVNULL,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    _check["at"] = 0.0   # 下次查詢重新檢查
    return {"started": True, "message": "已開始 codex login，瀏覽器會跳出登入頁；完成後按「重新連線」"}


# ---------- 用量（讀 logs/） ----------

def _kind(scope: str, name: str) -> str:
    if name == "preview":
        return "風格預覽"
    if re.fullmatch(r"g\d+", name):
        return "批次生圖"
    if name == "expand":
        return "表情擴寫" if scope == "stickers" else "畫風擴寫"
    if name.endswith("_describe"):
        return "角色特徵"
    if name.endswith("_analyze"):
        return "畫風分析"
    return "其他"


SCOPE_NAMES = {"characters": "角色庫", "style_lib": "畫風庫", "stickers": "表情"}


def _scope_labels(scopes: set[str]) -> dict[str, str]:
    """s15 → 「s15 暖柔奶油萌繪」；其他範圍用中文名"""
    cfg = load_styles_cfg().get("styles", {})
    out = {}
    for sc in scopes:
        if sc in SCOPE_NAMES:
            out[sc] = SCOPE_NAMES[sc]
            continue
        name = ((read_json(OUTPUTS / sc / "project.json") or {}).get("name") or cfg.get(sc, {}).get("name") or "")
        out[sc] = f"{sc} {name}".strip()
    return out


def _parse(path: Path) -> dict | None:
    m = NAME_RE.match(path.name)
    if not m:
        return None
    started = datetime.strptime(m["ts"], "%Y%m%d_%H%M%S")
    scope = path.parent.name
    tokens = usage.tokens_from_log(path)
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - 4096))
            tail = f.read().decode("utf-8", errors="replace")
    except OSError:
        tail = ""
    ends = list(END_RE.finditer(tail))
    if str(path) in codex.ACTIVE:
        result, seconds = "running", time.time() - codex.ACTIVE[str(path)]["started"]
    elif ends:
        e = ends[-1]
        try:
            seconds = (datetime.strptime(e["ts"].strip(), "%Y-%m-%d %H:%M:%S") - started).total_seconds()
        except ValueError:
            seconds = None
        result = "timeout" if e["reason"] == "timeout" else ("ok" if e["code"] == "0" or e["reason"] == "finished-early" else "failed")
    else:
        result, seconds = "unknown", None   # 伺服器中途被關掉之類
    return {"time": started.strftime("%Y-%m-%d %H:%M:%S"), "date": started.strftime("%Y-%m-%d"),
            "scope": scope, "name": m["name"], "kind": _kind(scope, m["name"]),
            "tokens": tokens, "seconds": round(seconds) if seconds is not None else None, "result": result,
            "log": path.relative_to(ROOT).as_posix()}


def usage_days(days: int = DAYS, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    first = (now - timedelta(days=days - 1)).date()
    runs = []
    if LOGS.exists():
        for p in LOGS.glob("*/*.log"):
            if p.parent.name in SKIP_DIRS:
                continue
            r = _parse(p)
            if r and datetime.strptime(r["date"], "%Y-%m-%d").date() >= first:
                runs.append(r)
    runs.sort(key=lambda r: r["time"], reverse=True)
    labels = _scope_labels({r["scope"] for r in runs})
    for r in runs:
        r["scope_label"] = labels[r["scope"]]
    daily = []
    for i in range(days):
        d = (first + timedelta(days=i)).isoformat()
        rs = [r for r in runs if r["date"] == d]
        by_kind: dict[str, int] = {}
        for r in rs:
            by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + (r["tokens"] or 0)
        daily.append({"date": d, "tokens": sum(r["tokens"] or 0 for r in rs), "runs": len(rs), "by_kind": by_kind})

    def group(key: str) -> list[dict]:
        g: dict[str, dict] = {}
        for r in runs:
            x = g.setdefault(r[key], {"key": r[key], "label": r.get(key + "_label", r[key]), "tokens": 0, "runs": 0})
            x["tokens"] += r["tokens"] or 0
            x["runs"] += 1
        return sorted(g.values(), key=lambda x: x["tokens"], reverse=True)

    grids = [r for r in runs if r["kind"] in ("批次生圖", "風格預覽") and r["tokens"]]
    return {
        "days": days, "daily": daily, "by_kind": group("kind"), "by_scope": group("scope"),
        "total_tokens": sum(r["tokens"] or 0 for r in runs), "runs": len(runs),
        "failed": sum(1 for r in runs if r["result"] in ("failed", "timeout")),
        "avg_grid_tokens": round(sum(r["tokens"] for r in grids) / len(grids)) if grids else None,
        "recent": runs[:RECENT],
    }


def status(force: bool = False) -> dict:
    running = []
    for path, a in list(codex.ACTIVE.items()):
        p = Path(path)
        m = NAME_RE.match(p.name)
        name = m["name"] if m else p.stem
        running.append({"scope": p.parent.name, "scope_label": _scope_labels({p.parent.name})[p.parent.name],
                        "kind": _kind(p.parent.name, name), "name": name,
                        "seconds": round(time.time() - a["started"])})
    sessions = usage.codex_home() / "sessions"
    return {**check(force), "rate": usage.rate_limits(force=force), "running": running,
            "sessions_dir": str(sessions), "sessions_found": sessions.exists(), "usage": usage_days()}

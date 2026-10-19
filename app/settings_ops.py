"""設定頁的操作：讀取現況、檢查路徑、改資料夾位置（搬移檔案）、選資料夾、在檔案總管開啟

改資料夾位置的流程：
  plan()  列出每個要改的資料夾：從哪到哪、要搬幾個檔、哪些檔在新位置已經有同名的（衝突）
  apply() move=True  逐檔搬過去（衝突照 conflict 處理：keep＝保留新位置的、overwrite＝覆蓋），
                     搬完把舊資料夾裡變空的子資料夾清掉，並把 project.json 裡記的舊路徑換成新路徑
          move=False 只改設定，舊檔案留在原地
有 Codex 在跑、或專案還在執行中時不能改（log 正在寫、參考圖正在用）。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from . import codex, settings
from .paths import APP_ROOT, ROOT, codex_path, outputs_dir, outside_root, read_json, write_json

USER_CONFIG_FILES = ("stickers.json", "sticker_groups.json")   # config_dir 只搬使用者自己的檔案
CONFLICT_LIST_MAX = 20
_pick_lock = threading.Lock()


# ---------- 現況 ----------

def _files(key: str, d: Path) -> list[Path]:
    """這個設定管的檔案（相對 d）；設定檔資料夾只算使用者的兩個檔"""
    if not d.exists():
        return []
    if key == "config_dir":
        return [Path(n) for n in USER_CONFIG_FILES if (d / n).is_file()]
    return [f.relative_to(d) for f in d.rglob("*") if f.is_file()]


def _stat(key: str, d: Path) -> dict:
    files = _files(key, d)
    return {"files": len(files), "size": sum((d / f).stat().st_size for f in files)}


def busy() -> str | None:
    """不能改資料夾的原因；可以改就回傳 None"""
    from . import jobs
    if codex.ACTIVE:
        return f"有 {len(codex.ACTIVE)} 個 Codex 正在執行"
    for f in outputs_dir().glob("*/project.json"):
        p = read_json(f) or {}
        if p.get("status") in jobs.BUSY:
            return f"專案 {p.get('id')} 正在執行中"
    return None


def info() -> dict:
    cur = settings.load()
    dirs = []
    for key, (default, label, desc) in settings.DIRS.items():
        d = settings.resolve(cur[key])
        dirs.append({"key": key, "label": label, "desc": desc, "value": str(d), "default": str(settings.default_dir(key)),
                     "path": str(d), "exists": d.exists(), **_stat(key, d)})
    return {
        "dirs": dirs,
        "values": {k: cur[k] for k in settings.DEFAULTS if k not in settings.DIRS},
        # 設定頁顯示用（含固定加上的沙盒參數；outputs 在資料根目錄外時的 --add-dir）
        "codex_command": ["codex", *cur["codex_args"], *codex.SANDBOX_ARGS, *codex.add_dir_args()],
        "defaults": {k: v for k, v in settings.DEFAULTS.items() if k not in settings.DIRS},
        "limits": settings.LIMITS, "layouts": list(settings.LAYOUTS),
        "settings_file": str(settings.FILE), "root": str(ROOT), "busy": busy(),
    }


# ---------- 檢查 ----------

def _inside(a: Path, b: Path) -> bool:
    """a 和 b 相同，或其中一個在另一個裡面"""
    return a == b or a in b.parents or b in a.parents


def check(key: str, value: str, others: dict | None = None) -> dict:
    """others：這次一起改的其他資料夾設定（還沒存），一起檢查有沒有互相包含"""
    if key not in settings.DIRS:
        raise KeyError(key)
    value = str(value or "").strip()
    if not value or not Path(value).is_absolute():
        return {"key": key, "value": value, "path": value, "exists": False, "files": 0, "size": 0, "warn": None,
                "error": f"請填完整路徑，例如 D:\\EMochiData\\{settings.DIRS[key][0]}"}
    d = settings.resolve(value)
    out = {"key": key, "value": value, "path": str(d), "exists": d.exists(), "error": None, "warn": None, **_stat(key, d)}
    cur = {**settings.load(), **(others or {})}
    forbidden = [(ROOT, "資料根目錄本身"), (APP_ROOT / "app", "程式資料夾 app"), (APP_ROOT / "web", "程式資料夾 web")]
    if key != "outputs_dir":
        # 資料根目錄下的 outputs/ 這個名字保留給專案輸出：project.json 裡的 outputs/... 一律指 outputs 資料夾
        forbidden.append((ROOT / "outputs", "資料根目錄下的 outputs（保留給專案輸出）"))
    for bad, name in forbidden:
        if d == bad or (bad != ROOT and _inside(d, bad)):
            out["error"] = f"不能放在{name}" + ("" if d == bad else "裡面或包含它")
            return out
    if d in ROOT.parents:
        out["error"] = "不能是包含整個專案的上層資料夾"
        return out
    for k in settings.DIRS:
        if k == key:
            continue
        o = settings.resolve(cur[k])
        if _inside(d, o):
            out["error"] = f"和「{settings.DIRS[k][1]}」（{o}）重疊"
            return out
    if d.exists() and not d.is_dir():
        out["error"] = "這個路徑是檔案，不是資料夾"
        return out
    # 能不能寫：找最近一個存在的上層資料夾，實際寫一個暫存檔再刪掉
    probe = d
    while not probe.exists() and probe.parent != probe:
        probe = probe.parent
    try:
        with tempfile.NamedTemporaryFile(dir=probe, prefix=".emochi_write_test_", delete=True):
            pass
    except OSError as e:
        out["error"] = f"沒辦法寫入 {probe}：{e.strerror or e}"
        return out
    if key in ("characters_dir", "style_lib_dir") and outside_root(d):
        out["warn"] = "放在專案資料夾外：生圖時 Codex 會用絕對路徑讀參考圖"
    if key == "outputs_dir" and outside_root(d):
        out["warn"] = "放在專案資料夾外：生圖時會加 --add-dir 讓 Codex 能寫入這裡"
    if not d.exists():
        out["warn"] = ((out["warn"] + "；") if out["warn"] else "") + "資料夾還不存在，儲存時會建立"
    return out


# ---------- 改位置 ----------

def plan(changes: dict) -> dict:
    """changes 只看資料夾設定；回傳每個有變的資料夾要搬什麼、有沒有衝突"""
    cur = settings.load()
    others = {k: v for k, v in changes.items() if k in settings.DIRS}
    items, errors = [], []
    for key, value in others.items():
        value = str(value or "").strip() or str(settings.default_dir(key))
        src, dst = settings.resolve(cur[key]), settings.resolve(value)
        if src == dst:
            continue
        c = check(key, value, others)
        if c["error"]:
            errors.append(f"{settings.DIRS[key][1]}：{c['error']}")
        files = _files(key, src)
        conflicts = [f.as_posix() for f in files if (dst / f).exists()]
        items.append({"key": key, "label": settings.DIRS[key][1], "from": str(src), "to": str(dst),
                      "files": len(files), "size": sum((src / f).stat().st_size for f in files),
                      "conflicts": conflicts[:CONFLICT_LIST_MAX], "conflict_count": len(conflicts)})
    return {"dirs": items, "errors": errors, "busy": busy()}


def _move_files(key: str, src: Path, dst: Path, conflict: str) -> dict:
    moved = skipped = 0
    files = _files(key, src)
    # 新位置還沒有東西：整個資料夾一次改名（同一顆磁碟幾乎瞬間完成；outputs 檔案多時差很多）。跨磁碟會失敗，改逐檔搬
    if key != "config_dir" and files and (not dst.exists() or (dst.is_dir() and not any(dst.iterdir()))):
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst.exists():
                dst.rmdir()
            os.rename(src, dst)
            return {"moved": len(files), "skipped": 0}
        except OSError:
            pass
    dst.mkdir(parents=True, exist_ok=True)
    for rel in files:
        a, b = src / rel, dst / rel
        if b.exists():
            if conflict == "keep":
                skipped += 1
                continue
            b.unlink()
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(a), str(b))
        moved += 1
    if key != "config_dir":   # 清掉舊位置變空的子資料夾（設定檔資料夾是程式內建 config/，不動）
        for d in sorted((p for p in src.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            try:
                d.rmdir()
            except OSError:
                pass
        try:
            src.rmdir()
        except OSError:
            pass
    return {"moved": moved, "skipped": skipped}


def _rewrite_projects(mapping: list[tuple[str, str]], roots: list[Path]) -> int:
    """project.json 裡記的路徑（參考圖、log）：舊資料夾開頭的換成新資料夾。
    roots：要改哪些 outputs 資料夾裡的專案（outputs 本身也在搬時，舊、新位置都看）。
    outputs 底下的檔案記的是邏輯路徑 outputs/...，不受 outputs 搬家影響，不用改"""
    def fix(v):
        if isinstance(v, str):
            for old, new in mapping:
                if v == old or v.startswith(old + "/"):
                    return new + v[len(old):]
            return v
        if isinstance(v, list):
            return [fix(x) for x in v]
        if isinstance(v, dict):
            return {k: fix(x) for k, x in v.items()}
        return v
    n = 0
    seen = set()
    for f in [f for r in dict.fromkeys(roots) for f in (*r.glob("*/project.json"), *r.glob("_removed/*/project.json"))]:
        if f.resolve() in seen:
            continue
        seen.add(f.resolve())
        p = read_json(f)
        if not p:
            continue
        q = fix(p)
        if json.dumps(q, ensure_ascii=False) != json.dumps(p, ensure_ascii=False):
            write_json(f, q)
            n += 1
    return n


def apply(changes: dict, move: bool = True, conflict: str | None = None) -> dict:
    vals = settings.validate(changes)
    dir_changes = {k: v for k, v in vals.items() if k in settings.DIRS}
    report = {"moved": [], "projects_updated": 0}
    if dir_changes:
        pl = plan(dir_changes)
        if pl["errors"]:
            raise ValueError("；".join(pl["errors"]))
        if pl["dirs"] and pl["busy"]:
            raise ValueError(f"{pl['busy']}，等它結束再改資料夾位置")
        if move and any(d["conflict_count"] for d in pl["dirs"]) and conflict not in ("keep", "overwrite"):
            raise ValueError("新位置已經有同名的檔案，請選擇保留新位置的還是覆蓋")
        mapping = []
        for d in pl["dirs"]:
            src, dst = Path(d["from"]), Path(d["to"])
            if move:
                r = _move_files(d["key"], src, dst, conflict or "keep")
                report["moved"].append({"key": d["key"], **r})
                if d["key"] != "outputs_dir":
                    mapping.append((codex_path(src), codex_path(dst)))
            else:
                dst.mkdir(parents=True, exist_ok=True)
        if mapping:
            new_out = settings.resolve(dir_changes["outputs_dir"]) if "outputs_dir" in dir_changes else outputs_dir()
            report["projects_updated"] = _rewrite_projects(mapping, [outputs_dir(), new_out])
    settings.save(vals)
    return {**info(), "report": report}


# ---------- 選資料夾、開啟資料夾 ----------

def pick_folder(initial: str | None = None) -> str | None:
    """在這台電腦上跳出資料夾選擇視窗（伺服器就跑在使用者的電腦上）。
    之後如果改成桌面應用程式（pywebview 等），換成它的原生對話框即可，前端不用改"""
    if not _pick_lock.acquire(blocking=False):
        raise ValueError("已經有一個選擇資料夾的視窗開著")
    try:
        import tkinter
        from tkinter import filedialog
        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)   # 不然常被瀏覽器蓋住
        root.update()
        start = initial if initial and Path(initial).exists() else str(ROOT)
        path = filedialog.askdirectory(parent=root, initialdir=start, title="選擇資料夾", mustexist=False)
        root.destroy()
        return str(Path(path).resolve()) if path else None
    finally:
        _pick_lock.release()


def open_folder(path: str) -> str:
    p = Path(path)
    while not p.exists() and p.parent != p:
        p = p.parent
    if sys.platform == "win32":
        os.startfile(p)  # noqa: S606
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(p)])
    else:
        subprocess.Popen(["xdg-open", str(p)])
    return str(p)


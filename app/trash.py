"""垃圾桶：專案、畫風庫、角色庫共用

刪除不直接刪檔，而是把整個資料夾移到同層的 _removed/<id>_<YYYYmmdd_HHMMSS>/：
  專案   outputs/_removed/      （project.json）
  畫風   style_lib/_removed/    （style.json）
  角色   characters/_removed/   （character.json）
垃圾桶裡可以還原，或永久刪除。永久刪除過的 id 記在 _removed/_deleted_ids.json，
連同垃圾桶裡的 id 一起保留，新建時不會再用到同一個編號（避免和舊紀錄混在一起）。
"""

import os
import shutil
import stat
import threading
from datetime import datetime
from pathlib import Path

from .paths import characters_dir, outputs_dir, read_json, style_lib_dir, url_path, write_json

# 種類 → (取得所在資料夾的函式, 中繼檔名)；角色庫、畫風庫的位置可以在設定頁改，所以每次重新取
KINDS = {
    "projects": (outputs_dir, "project.json"),
    "styles": (style_lib_dir, "style.json"),
    "characters": (characters_dir, "character.json"),
}
_lock = threading.Lock()


def _kind(kind: str) -> tuple[Path, str]:
    if kind not in KINDS:
        raise KeyError(f"垃圾桶種類 {kind}")
    get_dir, meta = KINDS[kind]
    return get_dir(), meta


def bin_dir(kind: str) -> Path:
    return _kind(kind)[0] / "_removed"


def _id_of(d: Path, meta: dict | None) -> str:
    return (meta or {}).get("id") or d.name.split("_")[0]


def move_to_trash(kind: str, item_id: str) -> Path:
    root, meta = _kind(kind)
    src = root / item_id
    if not (src / meta).exists():
        raise KeyError(item_id)
    with _lock:
        dest = bin_dir(kind) / f"{item_id}_{datetime.now():%Y%m%d_%H%M%S}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dest))
    return dest


def _entry(kind: str, name: str) -> Path:
    d = (bin_dir(kind) / name).resolve()
    if d.parent != bin_dir(kind).resolve() or not d.is_dir() or not (d / _kind(kind)[1]).exists():
        raise KeyError(name)
    return d


def _size(d: Path) -> int:
    return sum(f.stat().st_size for f in d.rglob("*") if f.is_file())


def _thumb(kind: str, d: Path, m: dict) -> str | None:
    """縮圖：專案用預覽圖（沒有就第一組網格），畫風／角色用第一張勾選的參考圖"""
    if kind == "projects":
        rels = [(m.get("preview") or {}).get("image")] + [g.get("image") for g in m.get("groups") or []]
        for r in filter(None, rels):
            # 專案裡的路徑是 outputs/<id>/...，搬進垃圾桶後要換成垃圾桶資料夾
            parts = Path(r).parts
            f = d.joinpath(*parts[2:]) if len(parts) > 2 else None
            if f and f.is_file():
                return url_path(f)
        return None
    imgs = m.get("images") or []
    for i in sorted(imgs, key=lambda i: not i.get("use")):
        f = d / "refs" / i["file"]
        if f.is_file():
            return url_path(f)
    return None


def list_items(kind: str) -> list[dict]:
    out = []
    b = bin_dir(kind)
    if not b.exists():
        return out
    root, meta_name = _kind(kind)
    for d in b.iterdir():
        m = read_json(d / meta_name) if d.is_dir() else None
        if not m:
            continue
        iid = _id_of(d, m)
        stamp = d.name[len(iid) + 1 :] if d.name.startswith(iid + "_") else ""
        try:
            removed = datetime.strptime(stamp, "%Y%m%d_%H%M%S").strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            removed = ""
        out.append(
            {
                "name": d.name,
                "id": iid,
                "title": m.get("name") or "",
                "status": m.get("status"),
                "removed": removed,
                "size": _size(d),
                "thumb": _thumb(kind, d, m),
                "restorable": not (root / iid).exists(),
            }
        )
    return sorted(out, key=lambda x: x["removed"], reverse=True)


def restore(kind: str, name: str) -> str:
    root, meta_name = _kind(kind)
    with _lock:
        d = _entry(kind, name)
        iid = _id_of(d, read_json(d / meta_name))
        if (root / iid).exists():
            raise ValueError(f"{iid} 已經存在，不能還原")
        shutil.move(str(d), str(root / iid))
    return iid


def _rmtree(d: Path) -> None:
    """Windows 上唯讀檔會讓 rmtree 失敗，先拿掉唯讀再刪"""

    def again(func, path, _exc):
        os.chmod(path, stat.S_IWRITE)
        func(path)

    shutil.rmtree(d, onexc=again)


def purge(kind: str, name: str | None = None) -> int:
    """永久刪除；name=None 表示清空這一類的垃圾桶"""
    meta_name = _kind(kind)[1]
    with _lock:
        targets = [_entry(kind, name)] if name else [bin_dir(kind) / t["name"] for t in list_items(kind)]
        ids = [_id_of(d, read_json(d / meta_name)) for d in targets]
        for d in targets:
            _rmtree(d)
        if ids:
            f = bin_dir(kind) / "_deleted_ids.json"
            write_json(f, sorted(set(read_json(f, [])) | set(ids)))
    return len(targets)


def reserved_ids(kind: str) -> set[str]:
    """垃圾桶裡的、永久刪除過的 id：新建時不要用"""
    b = bin_dir(kind)
    if not b.exists():
        return set()
    used = {p.name.split("_")[0] for p in b.iterdir() if p.is_dir()}
    return used | set(read_json(b / "_deleted_ids.json", []))

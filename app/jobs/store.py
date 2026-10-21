"""project.json 的讀寫：每個專案一把鎖、mutate（鎖內讀 → 改 → 存）、清單、刪除、重啟時標記中斷"""

import shutil
import threading
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from ..errors import Conflict, NotFound
from ..migrations import migrate_project
from ..paths import (
    outputs_dir,
    read_json,
    stored_path,
    write_json,
)
from ..project_types import (
    BUSY,
    Group,
    ItemStatus,
    Project,
    Status,
)

_locks: dict[str, threading.Lock] = {}


def _lock(style: str) -> threading.Lock:
    return _locks.setdefault(style, threading.Lock())


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def project_path(style: str) -> Path:
    return outputs_dir() / style / "project.json"


def load(style: str) -> Project | None:
    """讀 project.json 並升到最新格式（見 app/migrations.py）"""
    return migrate_project(read_json(project_path(style)))


def save(proj: Project) -> Project:
    proj["updated"] = now()
    write_json(project_path(proj["id"]), proj)
    return proj


def mutate(style: str, fn: Callable[[Project], None]) -> Project:
    """在鎖內讀 → 改 → 存，避免背景執行緒互相覆蓋"""
    with _lock(style):
        proj = load(style)
        if proj is None:
            raise NotFound(f"專案 {style}")
        fn(proj)
        return save(proj)


def list_projects() -> list[dict]:
    out = []
    for f in sorted(outputs_dir().glob("*/project.json")):
        proj = migrate_project(read_json(f))
        if proj:
            item = {k: proj.get(k) for k in ("id", "name", "status", "updated", "request")}
            item["character_id"] = proj["refs"]["character_id"]
            out.append(item)
    return sorted(out, key=lambda x: x.get("updated") or "", reverse=True)


def delete(style: str) -> None:
    """刪除專案：移到垃圾桶 outputs/_removed/（見 trash.py）。已完成的專案，貼圖也會一起從 Gallery 消失。執行中不能刪"""
    from .. import trash

    with _lock(style):
        proj = load(style)
        if not proj:
            raise NotFound(f"專案 {style}")
        if proj.get("status") in BUSY:
            raise Conflict("專案正在執行中，等它結束再刪除")
        trash.move_to_trash("projects", style)


def recover_interrupted() -> None:
    """伺服器重啟時，把還停在「執行中」的專案標記為中斷"""
    for f in outputs_dir().glob("*/project.json"):
        proj = read_json(f)
        if not proj or proj.get("status") not in BUSY:
            continue
        for group in proj.get("groups", []):
            if group.get("status") == ItemStatus.RUNNING:
                group.update(status=ItemStatus.FAILED, message="伺服器重啟，執行被中斷")
        if (proj.get("preview") or {}).get(
            "status"
        ) == ItemStatus.RUNNING:  # 舊專案（s1～s5）的 preview 是 null
            proj["preview"].update(status=ItemStatus.FAILED, message="伺服器重啟，執行被中斷")
        proj["status"] = Status.REVIEW if proj.get("groups") else Status.DRAFT
        proj["error"] = "上次執行被中斷，請重新操作"
        save(proj)


def rel(path: Path) -> str:
    """存進 project.json 的路徑：outputs 底下記邏輯路徑 outputs/...，其他資料根目錄底下用相對路徑、否則絕對路徑。
    交給 Codex 前由 codex.run_image 換成實際路徑"""
    return stored_path(path)


def backup(path: Path) -> None:
    if path.exists():
        prev = path.parent / "_prev"
        prev.mkdir(exist_ok=True)
        stamp = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y%m%d_%H%M%S")
        shutil.copy2(path, prev / f"{path.stem}_{stamp}{path.suffix}")


def _group(proj: Project, index: int) -> Group:
    for group in proj["groups"]:
        if group["index"] == index:
            return group
    raise NotFound(f"第 {index} 組")


def _label(proj: Project) -> str:
    return f"{proj.get('name') or '未命名'}（{proj['id']}）"

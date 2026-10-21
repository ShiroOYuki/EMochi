"""參考圖：角色庫的圖＋這個畫風專用的暫時參考圖；view() 是所有回傳專案的 API 共用的整理"""

from pathlib import Path

from .. import characters, usage
from ..images import move_to_removed, save_png
from ..paths import (
    ROOT,
    outputs_dir,
)
from ..project_types import (
    EDITABLE,
    Project,
    RefPaths,
    Refs,
    require_status,
)
from .store import mutate, rel


def _role(role: str) -> str:
    return "style" if role == "style" else "character"


def temp_dir(style: str) -> Path:
    return outputs_dir() / style / "refs"


def refs_of(proj: Project) -> Refs:
    refs = proj.get("refs") or {}
    return {
        "character_id": refs.get("character_id"),
        "character_images": refs.get("character_images"),
        "temp": list(refs.get("temp", [])),
    }


def view(proj: Project) -> dict:
    """給前端的專案資料：補上整理過的參考圖資訊。所有回傳專案的 API 都要經過這裡，
    否則前端拿到的欄位會時有時無（之前白畫面就是這樣來的）"""
    out = {**proj, "refs": refs_of(proj), "ref_paths": ref_paths(proj)}
    if proj.get("preview"):
        out["preview"] = _with_tokens(proj["preview"])
    out["groups"] = [_with_tokens(group) for group in proj.get("groups") or []]
    return out


def _with_tokens(item: dict) -> dict:
    """從這張圖的 Codex 紀錄讀出花了多少 token（重生後 log 會換成新的那次）"""
    log = item.get("log")
    return {**item, "tokens": usage.tokens_from_log(ROOT / log) if log else None}


def ref_paths(proj: Project) -> RefPaths:
    """要附給 Codex 的參考圖與角色資訊，路徑相對於專案根目錄（Codex 的 cwd）"""
    refs = refs_of(proj)
    char, identity, ears = [], "", True  # 角色特徵句只來自角色庫；沒選角色就靠附圖，不塞原角色的特徵
    if refs["character_id"]:
        char = characters.rel_paths(refs["character_id"], refs["character_images"])
        c = characters.get(refs["character_id"]) or {}
        identity, ears = c.get("identity", ""), characters.has_ears(c)
    tmp = {"character": [], "style": []}
    for t in refs["temp"]:
        if (temp_dir(proj["id"]) / t["file"]).exists():
            tmp[_role(t["role"])].append(rel(temp_dir(proj["id"]) / t["file"]))
    return {"character": char + tmp["character"], "style": tmp["style"], "identity": identity, "ears": ears}


def add_temp_refs(style: str, files: list[tuple[str, bytes, str]]) -> Project:
    def change(proj):
        require_status(proj, EDITABLE, "改參考圖")
        refs = refs_of(proj)
        for name, raw, role in files:
            refs["temp"].append({"file": save_png(raw, temp_dir(style), name), "role": _role(role)})
        proj["refs"] = refs

    return mutate(style, change)


def update_temp_ref(style: str, file: str, role: str | None = None, remove: bool = False) -> Project:
    def change(proj):
        require_status(proj, EDITABLE, "改參考圖")
        refs = refs_of(proj)
        if remove:
            move_to_removed(temp_dir(style) / Path(file).name)
            refs["temp"] = [t for t in refs["temp"] if t["file"] != file]
        else:
            for t in refs["temp"]:
                if t["file"] == file:
                    t["role"] = _role(role or "character")
        proj["refs"] = refs

    return mutate(style, change)

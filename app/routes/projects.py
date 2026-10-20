"""生成：畫風專案的建立、擴寫、預覽、批次生成、收尾，以及垃圾桶"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import jobs, prompts, settings, trash
from ..paths import ROOT, logs_dir, next_style_id
from ._shared import Upload, _decode

router = APIRouter()


@router.get("/api/projects")
def projects():
    return {"projects": jobs.list_projects(), "next_id": next_style_id(),
            "preview_ids": prompts.template().get("preview_ids", []), "max_parallel": settings.get("max_parallel"),
            "default_layout": settings.get("default_layout")}


@router.get("/api/projects/{style}")
def project(style: str):
    p = jobs.load(style)
    if not p:
        raise HTTPException(404, f"找不到專案 {style}")
    return jobs.view(p)


@router.get("/api/trash/{kind}")
def trash_list(kind: str):
    return trash.list_items(kind)


@router.post("/api/trash/{kind}/{name}/restore")
def trash_restore(kind: str, name: str):
    return {"id": trash.restore(kind, name)}


@router.delete("/api/trash/{kind}/{name}")
def trash_purge(kind: str, name: str):
    return {"deleted": trash.purge(kind, name)}


@router.delete("/api/trash/{kind}")
def trash_empty(kind: str):
    return {"deleted": trash.purge(kind, None)}


@router.delete("/api/projects/{style}")
def delete_project(style: str):
    jobs.delete(style)
    return {"ok": True}


class CreateBody(BaseModel):
    request: str = ""
    character_id: str | None = None
    character_images: list[str] | None = None
    temp_refs: list[Upload] = []
    style_lib_id: str | None = None


class ExpandBody(BaseModel):
    request: str


@router.post("/api/projects")
def create(body: CreateBody):
    return jobs.view(jobs.create(body.request, body.character_id, body.character_images, _decode(body.temp_refs), body.style_lib_id))


@router.post("/api/projects/{style}/refs")
def add_refs(style: str, files: list[Upload]):
    return jobs.view(jobs.add_temp_refs(style, _decode(files)))


class RefPatch(BaseModel):
    role: str | None = None
    remove: bool = False


@router.patch("/api/projects/{style}/refs/{file}")
def patch_ref(style: str, file: str, body: RefPatch):
    return jobs.view(jobs.update_temp_ref(style, file, body.role, body.remove))


@router.post("/api/projects/{style}/expand")
def reexpand(style: str, body: ExpandBody):
    return jobs.view(jobs.reexpand(style, body.request))


@router.patch("/api/projects/{style}")
def update(style: str, body: dict):
    return jobs.view(jobs.update(style, body))


@router.get("/api/projects/{style}/prompt")
def prompt_preview(style: str):
    """目前描述組出來的完整預覽 prompt（不執行）"""
    p = jobs.load(style)
    if not p:
        raise HTTPException(404)
    text, ids, out, refs = jobs.preview_prompt(p)
    return {"prompt": text, "ids": ids, "output": out, "refs": refs}


@router.post("/api/projects/{style}/preview")
def preview(style: str):
    return jobs.view(jobs.start_preview(style))


class GenBody(BaseModel):
    ids: list[int]
    layout: str = "4x2w"   # 4x2w（2:1 畫布、8 格，預設）或 3x2（3:2 畫布、6 格）


@router.post("/api/projects/{style}/generate")
def generate(style: str, body: GenBody):
    return jobs.view(jobs.start_generate(style, body.ids, body.layout))


@router.post("/api/projects/{style}/groups/{index}/regenerate")
def regenerate(style: str, index: int):
    return jobs.view(jobs.regenerate_group(style, index))


@router.post("/api/projects/{style}/recheck/{target}")
def recheck(style: str, target: str):
    """target = preview 或組別編號；只重新檢查現有的圖，不會呼叫 Codex"""
    return jobs.view(jobs.recheck(style, target))


@router.post("/api/projects/{style}/accept/{target}")
def accept(style: str, target: str):
    """target = preview 或組別編號；使用者判斷圖沒問題，手動當成成功（不呼叫 Codex）"""
    return jobs.view(jobs.accept(style, target))


@router.post("/api/projects/{style}/finalize")
def finalize(style: str):
    return jobs.view(jobs.start_finalize(style))


@router.post("/api/projects/{style}/reopen")
def reopen(style: str):
    return jobs.view(jobs.reopen(style))


@router.get("/api/projects/{style}/log")
def log(style: str, path: str):
    p = (ROOT / path).resolve()   # 專案裡記的 log 路徑：相對資料根目錄或絕對路徑
    if logs_dir().resolve() not in p.parents or not p.is_file():
        raise HTTPException(404)
    return {"text": p.read_text(encoding="utf-8", errors="replace")[-20000:]}

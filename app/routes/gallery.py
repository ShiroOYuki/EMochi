"""圖庫：匯出、總覽圖、勾選清單、匯出預設集"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import gallery, presets
from .. import schemas as S
from ..paths import exports_dir, read_json
from ._shared import OUT

router = APIRouter()


@router.get("/api/gallery", response_model=list[S.GalleryStyle], **OUT)
def gallery_styles():
    return gallery.scan()


class ExportBody(BaseModel):
    keys: list[str]
    presets: list[str] = []
    custom: dict | None = None  # 單次自訂（不存成預設集）
    formats: list[str] | None = None  # 舊版格式代號（t112、discord…），相容舊的呼叫
    tag: str = ""


@router.post("/api/gallery/export", response_model=S.ExportResult, **OUT)
def export(body: ExportBody):
    if not body.keys:
        raise HTTPException(400, "請先勾選貼圖")
    return gallery.export(body.keys, body.presets, body.custom, body.tag, fmts=body.formats)


class PresetsBody(BaseModel):
    presets: list[dict]


@router.get("/api/export-presets", response_model=S.PresetState, **OUT)
def get_presets():
    return {"presets": presets.load(), "custom": presets.is_custom()}


@router.put("/api/export-presets", response_model=S.PresetState, **OUT)
def put_presets(body: PresetsBody):
    return {"presets": presets.save(body.presets), "custom": True}


@router.post("/api/export-presets/reset", response_model=S.PresetState, **OUT)
def reset_presets():
    return {"presets": presets.reset(), "custom": False}


class CombineBody(BaseModel):
    keys: list[str]
    cols: int = 8
    cell: int = 128
    gap: int = 8
    bg: str = "transparent"
    labels: bool = False


@router.post("/api/gallery/combine", response_model=S.FileResult, **OUT)
def combine(body: CombineBody):
    return gallery.combine(body.keys, body.cols, body.cell, body.gap, body.bg, body.labels)


class SelectionBody(BaseModel):
    keys: list[str]
    presets: list[str] | None = None
    custom: dict | None = None
    formats: list[str] | None = None
    combine: dict | None = None
    tag: str = ""


@router.get("/api/gallery/selections", response_model=list[S.SelectionInfo], **OUT)
def selections():
    return gallery.list_selections()


@router.post("/api/gallery/selections", response_model=S.FileResult, **OUT)
def save_selection(body: SelectionBody):
    if not body.keys:
        raise HTTPException(400, "請先勾選貼圖")
    return gallery.save_selection(body.keys, body.presets, body.custom, body.combine, body.tag, body.formats)


@router.get("/api/gallery/selections/{name}")
def get_selection(name: str):
    base = exports_dir().resolve()
    p = (base / name).resolve()
    if base not in p.parents or p.suffix != ".json" or not p.exists():
        raise HTTPException(404)
    return JSONResponse(read_json(p))

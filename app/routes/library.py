"""角色庫、畫風庫"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import characters, jobs, style_lib
from ._shared import Upload, _decode

router = APIRouter()


@router.get("/api/characters")
def list_characters():
    return characters.list_all()


class NewCharacter(BaseModel):
    name: str
    images: list[Upload] = []


@router.post("/api/characters")
def create_character(body: NewCharacter):
    return characters.create(body.name, [(n, d) for n, d, _ in _decode(body.images)])


@router.patch("/api/characters/{cid}")
def update_character(cid: str, body: dict):
    return characters.update(cid, body)


@router.delete("/api/characters/{cid}")
def delete_character(cid: str):
    characters.delete(cid)
    return {"ok": True}


@router.post("/api/characters/{cid}/images")
def add_character_images(cid: str, files: list[Upload]):
    return characters.add_images(cid, [(n, d) for n, d, _ in _decode(files)])


@router.delete("/api/characters/{cid}/images/{file}")
def remove_character_image(cid: str, file: str):
    return characters.remove_image(cid, file)


@router.post("/api/characters/{cid}/describe")
def describe_character(cid: str):
    """同步等 Codex 看圖（約 30~90 秒）；前端顯示讀取中"""
    return characters.describe(cid)


@router.get("/api/style-lib")
def list_style_lib():
    return style_lib.list_all()


@router.get("/api/style-lib/importable")
def style_lib_importable():
    return style_lib.importable()


class NewLibStyle(BaseModel):
    name: str = ""
    request: str = ""
    images: list[Upload] = []
    analyze: bool = True


@router.post("/api/style-lib")
def create_lib_style(body: NewLibStyle):
    """建立＋（預設）立刻讓 Codex 分析；分析失敗時畫風仍會留著，回傳裡帶 error"""
    s = style_lib.create(body.name, [(n, d) for n, d, _ in _decode(body.images)], body.request)
    if not body.analyze:
        return s
    try:
        return style_lib.analyze(s["id"], jobs.style_examples())
    except Exception as e:  # noqa: BLE001
        return {**s, "error": f"分析失敗：{e}"}


class ImportBody(BaseModel):
    project: str


@router.post("/api/style-lib/import")
def import_lib_style(body: ImportBody):
    return style_lib.import_project(body.project)


@router.post("/api/projects/{style}/to-library")
def project_to_library(style: str):
    """把專案目前的畫風存進畫風庫：範例圖＝預覽圖＋專案的畫風參考圖"""
    p = jobs.load(style)
    if not p:
        raise HTTPException(404, f"找不到專案 {style}")
    return style_lib.import_project(style, jobs.ref_paths(p)["style"])


@router.patch("/api/style-lib/{sid}")
def update_lib_style(sid: str, body: dict):
    return style_lib.update(sid, body)


@router.delete("/api/style-lib/{sid}")
def delete_lib_style(sid: str):
    style_lib.delete(sid)
    return {"ok": True}


@router.post("/api/style-lib/{sid}/images")
def add_lib_images(sid: str, files: list[Upload]):
    return style_lib.add_images(sid, [(n, d) for n, d, _ in _decode(files)])


@router.delete("/api/style-lib/{sid}/images/{file}")
def remove_lib_image(sid: str, file: str):
    return style_lib.remove_image(sid, file)


class AnalyzeBody(BaseModel):
    request: str | None = None


@router.post("/api/style-lib/{sid}/analyze")
def analyze_lib_style(sid: str, body: AnalyzeBody):
    """同步等 Codex 看圖（約 30~90 秒）"""
    return style_lib.analyze(sid, jobs.style_examples(), body.request)

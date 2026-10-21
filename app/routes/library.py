"""角色庫、畫風庫"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import characters, jobs, style_lib
from .. import schemas as S
from ._shared import OUT, Framing, ProcessPatch, Upload, _decode

router = APIRouter()


class CharacterPatch(BaseModel):
    """只會改有傳的欄位；use＝{檔名: 是否預設附上}"""

    name: str | None = None
    identity: str | None = None
    notes_zh: str | None = None
    ears: bool | None = None  # null＝由特徵句自動判斷
    use: dict[str, bool] | None = None


class LibStylePatch(BaseModel):
    name: str | None = None
    request: str | None = None
    style_block: str | None = None
    notes_zh: str | None = None
    framing: Framing | None = None
    process: ProcessPatch | None = None
    use: dict[str, bool] | None = None


@router.get("/api/characters", response_model=list[S.Character], **OUT)
def list_characters():
    return characters.list_all()


class NewCharacter(BaseModel):
    name: str
    images: list[Upload] = []


@router.post("/api/characters", response_model=S.Character, **OUT)
def create_character(body: NewCharacter):
    return characters.create(body.name, [(n, d) for n, d, _ in _decode(body.images)])


@router.patch("/api/characters/{cid}", response_model=S.Character, **OUT)
def update_character(cid: str, body: CharacterPatch):
    return characters.update(cid, body.model_dump(exclude_unset=True))


@router.delete("/api/characters/{cid}", response_model=S.Ok, **OUT)
def delete_character(cid: str):
    characters.delete(cid)
    return {"ok": True}


@router.post("/api/characters/{cid}/images", response_model=S.Character, **OUT)
def add_character_images(cid: str, files: list[Upload]):
    return characters.add_images(cid, [(n, d) for n, d, _ in _decode(files)])


@router.delete("/api/characters/{cid}/images/{file}", response_model=S.Character, **OUT)
def remove_character_image(cid: str, file: str):
    return characters.remove_image(cid, file)


@router.post("/api/characters/{cid}/describe", response_model=S.Character, **OUT)
def describe_character(cid: str):
    """同步等 Codex 看圖（約 30~90 秒）；前端顯示讀取中"""
    return characters.describe(cid)


@router.get("/api/style-lib", response_model=list[S.LibStyle], **OUT)
def list_style_lib():
    return style_lib.list_all()


@router.get("/api/style-lib/importable", response_model=list[S.Importable], **OUT)
def style_lib_importable():
    return style_lib.importable()


class NewLibStyle(BaseModel):
    name: str = ""
    request: str = ""
    images: list[Upload] = []
    analyze: bool = True


@router.post("/api/style-lib", response_model=S.LibStyle, **OUT)
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


@router.post("/api/style-lib/import", response_model=S.LibStyle, **OUT)
def import_lib_style(body: ImportBody):
    return style_lib.import_project(body.project)


@router.post("/api/projects/{style}/to-library", response_model=S.LibStyle, **OUT)
def project_to_library(style: str):
    """把專案目前的畫風存進畫風庫：範例圖＝預覽圖＋專案的畫風參考圖"""
    p = jobs.load(style)
    if not p:
        raise HTTPException(404, f"找不到專案 {style}")
    return style_lib.import_project(style, jobs.ref_paths(p)["style"])


@router.patch("/api/style-lib/{sid}", response_model=S.LibStyle, **OUT)
def update_lib_style(sid: str, body: LibStylePatch):
    return style_lib.update(sid, body.model_dump(exclude_unset=True))


@router.delete("/api/style-lib/{sid}", response_model=S.Ok, **OUT)
def delete_lib_style(sid: str):
    style_lib.delete(sid)
    return {"ok": True}


@router.post("/api/style-lib/{sid}/images", response_model=S.LibStyle, **OUT)
def add_lib_images(sid: str, files: list[Upload]):
    return style_lib.add_images(sid, [(n, d) for n, d, _ in _decode(files)])


@router.delete("/api/style-lib/{sid}/images/{file}", response_model=S.LibStyle, **OUT)
def remove_lib_image(sid: str, file: str):
    return style_lib.remove_image(sid, file)


class AnalyzeBody(BaseModel):
    request: str | None = None


@router.post("/api/style-lib/{sid}/analyze", response_model=S.LibStyle, **OUT)
def analyze_lib_style(sid: str, body: AnalyzeBody):
    """同步等 Codex 看圖（約 30~90 秒）"""
    return style_lib.analyze(sid, jobs.style_examples(), body.request)

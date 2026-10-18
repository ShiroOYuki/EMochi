"""FastAPI：/api/* 給前端用，其餘路徑回傳 React build（app/static）"""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import characters, gallery, jobs, prompts
from .images import decode_data_url
from .paths import EXPORTS, OUTPUTS, ROOT, STATIC, add_sticker, load_stickers, next_style_id, read_json

app = FastAPI(title="AI Sticker")


@app.on_event("startup")
def _startup():
    characters.ensure_default()
    characters.normalize_names()
    jobs.recover_interrupted()


def _err(e: Exception):
    if isinstance(e, KeyError):
        raise HTTPException(404, f"找不到：{e}")
    raise HTTPException(400, str(e))


# ---------- 共用 ----------

@app.get("/api/stickers")
def stickers():
    return load_stickers()


class NewSticker(BaseModel):
    label: str
    zh: str = ""
    prompt: str
    align: str | None = None


@app.post("/api/stickers")
def create_sticker(body: NewSticker):
    if not body.label.strip() or not body.prompt.strip():
        raise HTTPException(400, "名稱和英文描述都要填")
    return add_sticker(body.label, body.zh, body.prompt, body.align)


@app.get("/files/{path:path}")
def files(path: str):
    """outputs/ 與 exports/ 底下的檔案（圖片、zip、json）"""
    p = (ROOT / path).resolve()
    bases = (OUTPUTS, EXPORTS, characters.CHAR_DIR)
    if not any(base.resolve() in p.parents for base in bases) or not p.is_file():
        raise HTTPException(404)
    headers = {"Cache-Control": "no-store"}
    if p.suffix == ".zip":
        return FileResponse(p, filename=p.name, headers=headers)
    return FileResponse(p, headers=headers)


# ---------- Gen ----------

@app.get("/api/projects")
def projects():
    return {"projects": jobs.list_projects(), "next_id": next_style_id(),
            "preview_ids": prompts.template().get("preview_ids", []), "max_parallel": jobs.MAX_PARALLEL}


@app.get("/api/projects/{style}")
def project(style: str):
    p = jobs.load(style)
    if not p:
        raise HTTPException(404, f"找不到專案 {style}")
    return jobs.view(p)


class Upload(BaseModel):
    """前端用 FileReader 讀成 data URL 傳上來，免裝 python-multipart"""
    name: str = "image.png"
    data: str
    role: str = "character"   # 暫時參考圖：character / style


def _decode(files: list[Upload]) -> list[tuple[str, bytes, str]]:
    try:
        return [(f.name, decode_data_url(f.data), f.role) for f in files]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"圖片讀取失敗：{e}")


class CreateBody(BaseModel):
    request: str = ""
    character_id: str | None = None
    character_images: list[str] | None = None
    temp_refs: list[Upload] = []


class ExpandBody(BaseModel):
    request: str


@app.post("/api/projects")
def create(body: CreateBody):
    try:
        return jobs.view(jobs.create(body.request, body.character_id, body.character_images, _decode(body.temp_refs)))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/projects/{style}/refs")
def add_refs(style: str, files: list[Upload]):
    try:
        return jobs.view(jobs.add_temp_refs(style, _decode(files)))
    except Exception as e:  # noqa: BLE001
        _err(e)


class RefPatch(BaseModel):
    role: str | None = None
    remove: bool = False


@app.patch("/api/projects/{style}/refs/{file}")
def patch_ref(style: str, file: str, body: RefPatch):
    try:
        return jobs.view(jobs.update_temp_ref(style, file, body.role, body.remove))
    except Exception as e:  # noqa: BLE001
        _err(e)


# ---------- 角色庫 ----------

@app.get("/api/characters")
def list_characters():
    return characters.list_all()


class NewCharacter(BaseModel):
    name: str
    images: list[Upload] = []


@app.post("/api/characters")
def create_character(body: NewCharacter):
    try:
        return characters.create(body.name, [(n, d) for n, d, _ in _decode(body.images)])
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.patch("/api/characters/{cid}")
def update_character(cid: str, body: dict):
    try:
        return characters.update(cid, body)
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/characters/{cid}/images")
def add_character_images(cid: str, files: list[Upload]):
    try:
        return characters.add_images(cid, [(n, d) for n, d, _ in _decode(files)])
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.delete("/api/characters/{cid}/images/{file}")
def remove_character_image(cid: str, file: str):
    try:
        return characters.remove_image(cid, file)
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/characters/{cid}/describe")
def describe_character(cid: str):
    """同步等 Codex 看圖（約 30~90 秒）；前端顯示讀取中"""
    try:
        return characters.describe(cid)
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/projects/{style}/expand")
def reexpand(style: str, body: ExpandBody):
    try:
        return jobs.view(jobs.reexpand(style, body.request))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.patch("/api/projects/{style}")
def update(style: str, body: dict):
    try:
        return jobs.view(jobs.update(style, body))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.get("/api/projects/{style}/prompt")
def prompt_preview(style: str):
    """目前描述組出來的完整預覽 prompt（不執行）"""
    p = jobs.load(style)
    if not p:
        raise HTTPException(404)
    text, ids, out, refs = jobs.preview_prompt(p)
    return {"prompt": text, "ids": ids, "output": out, "refs": refs}


@app.post("/api/projects/{style}/preview")
def preview(style: str):
    try:
        return jobs.view(jobs.start_preview(style))
    except Exception as e:  # noqa: BLE001
        _err(e)


class GenBody(BaseModel):
    ids: list[int]


@app.post("/api/projects/{style}/generate")
def generate(style: str, body: GenBody):
    try:
        return jobs.view(jobs.start_generate(style, body.ids))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/projects/{style}/groups/{index}/regenerate")
def regenerate(style: str, index: int):
    try:
        return jobs.view(jobs.regenerate_group(style, index))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/projects/{style}/recheck/{target}")
def recheck(style: str, target: str):
    """target = preview 或組別編號；只重新檢查現有的圖，不會呼叫 Codex"""
    try:
        return jobs.view(jobs.recheck(style, target))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/projects/{style}/finalize")
def finalize(style: str):
    try:
        return jobs.view(jobs.start_finalize(style))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/projects/{style}/reopen")
def reopen(style: str):
    try:
        return jobs.view(jobs.reopen(style))
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.get("/api/projects/{style}/log")
def log(style: str, path: str):
    p = (ROOT / path).resolve()
    if (ROOT / "logs").resolve() not in p.parents or not p.is_file():
        raise HTTPException(404)
    return {"text": p.read_text(encoding="utf-8", errors="replace")[-20000:]}


# ---------- Gallery ----------

@app.get("/api/gallery")
def gallery_styles():
    return gallery.scan()


class ExportBody(BaseModel):
    keys: list[str]
    formats: list[str]
    tag: str = ""


@app.post("/api/gallery/export")
def export(body: ExportBody):
    if not body.keys or not body.formats:
        raise HTTPException(400, "請勾選貼圖與格式")
    return gallery.export(body.keys, body.formats, body.tag)


class CombineBody(BaseModel):
    keys: list[str]
    cols: int = 8
    cell: int = 128
    gap: int = 8
    bg: str = "transparent"
    labels: bool = False


@app.post("/api/gallery/combine")
def combine(body: CombineBody):
    try:
        return gallery.combine(body.keys, body.cols, body.cell, body.gap, body.bg, body.labels)
    except Exception as e:  # noqa: BLE001
        _err(e)


class SelectionBody(BaseModel):
    keys: list[str]
    formats: list[str] | None = None
    combine: dict | None = None
    tag: str = ""


@app.get("/api/gallery/selections")
def selections():
    return gallery.list_selections()


@app.post("/api/gallery/selections")
def save_selection(body: SelectionBody):
    if not body.keys:
        raise HTTPException(400, "請先勾選貼圖")
    return gallery.save_selection(body.keys, body.formats, body.combine, body.tag)


@app.get("/api/gallery/selections/{name}")
def get_selection(name: str):
    p = (EXPORTS / name).resolve()
    if EXPORTS.resolve() not in p.parents or p.suffix != ".json" or not p.exists():
        raise HTTPException(404)
    return JSONResponse(read_json(p))


# ---------- 前端 ----------

if (STATIC / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")


@app.get("/{full:path}")
def spa(full: str):
    index = STATIC / "index.html"
    if not index.exists():
        return JSONResponse({"error": "前端尚未建置：cd web && npm install && npm run build"}, 500)
    return FileResponse(index, headers={"Cache-Control": "no-store"})

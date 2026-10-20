"""表情與表情分組"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import stickers as sticker_mod
from ..paths import load_stickers

router = APIRouter()


@router.get("/api/stickers")
def stickers(all: bool = False):
    """預設只回傳沒刪除的；all=1 連已刪除的一起（表情分頁的「已刪除」清單用）"""
    items = load_stickers()
    return items if all else sticker_mod.active(items)


class NewSticker(BaseModel):
    label: str
    zh: str = ""
    prompt: str
    prompt_no_ears: str = ""
    align: str | None = None
    group_id: int | None = None


@router.post("/api/stickers")
def create_sticker(body: NewSticker):
    if not body.label.strip() or not body.prompt.strip():
        raise HTTPException(400, "名稱和英文描述都要填")
    return sticker_mod.add(body.label, body.zh, body.prompt, body.align, body.prompt_no_ears, body.group_id)


class StickerPatch(BaseModel):
    label: str | None = None
    zh: str | None = None
    prompt: str | None = None
    prompt_no_ears: str | None = None
    align: str | None = None


class ExpandSticker(BaseModel):
    idea: str = ""
    label: str = ""
    zh: str = ""
    prompt: str = ""


@router.post("/api/stickers/expand")
def expand_sticker(body: ExpandSticker):
    """讓 Codex 把一句話擴寫成表情設定（同步，約 10~30 秒）；只回傳建議，不存檔"""
    return sticker_mod.expand(body.idea, body.model_dump())


@router.patch("/api/stickers/{sid}")
def patch_sticker(sid: int, body: StickerPatch):
    return sticker_mod.update(sid, body.model_dump(exclude_unset=True))


@router.delete("/api/stickers/{sid}")
def delete_sticker(sid: int):
    return sticker_mod.remove(sid)


@router.post("/api/stickers/{sid}/restore")
def restore_sticker(sid: int):
    return sticker_mod.restore(sid)


@router.get("/api/sticker-groups")
def sticker_groups():
    return sticker_mod.load_groups()


class StickerGroup(BaseModel):
    id: int | None = None
    name: str
    ids: list[int] = []
    default: bool = False


@router.put("/api/sticker-groups")
def put_sticker_groups(body: list[StickerGroup]):
    return sticker_mod.save_groups([g.model_dump() for g in body])

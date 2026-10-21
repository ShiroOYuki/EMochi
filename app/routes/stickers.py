"""表情與表情分組"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import schemas as S
from .. import stickers as sticker_mod
from ..paths import load_stickers
from ._shared import OUT, Upload, _decode

router = APIRouter()


@router.get("/api/stickers", response_model=list[S.Sticker], **OUT)
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


@router.post("/api/stickers", response_model=S.Sticker, **OUT)
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


@router.post("/api/stickers/expand", response_model=S.StickerDraft, **OUT)
def expand_sticker(body: ExpandSticker):
    """讓 Codex 把一句話擴寫成表情設定（同步，約 10~30 秒）；只回傳建議，不存檔"""
    return sticker_mod.expand(body.idea, body.model_dump())


class AnalyzeSticker(ExpandSticker):
    image: Upload


@router.post("/api/stickers/analyze", response_model=S.StickerDraft, **OUT)
def analyze_sticker(body: AnalyzeSticker):
    """表情分析：Codex 看範例圖填表情設定（同步，約 20~40 秒）；只回傳建議，範例圖要另外存（PUT example）"""
    ((_, raw, _),) = _decode([body.image])
    return sticker_mod.expand(body.idea, body.model_dump(exclude={"image"}), image=raw)


@router.put("/api/stickers/{sid}/example", response_model=S.Sticker, **OUT)
def put_sticker_example(sid: int, body: Upload):
    ((_, raw, _),) = _decode([body])
    return sticker_mod.set_example(sid, raw)


@router.delete("/api/stickers/{sid}/example", response_model=S.Sticker, **OUT)
def delete_sticker_example(sid: int):
    return sticker_mod.remove_example(sid)


@router.patch("/api/stickers/{sid}", response_model=S.Sticker, **OUT)
def patch_sticker(sid: int, body: StickerPatch):
    return sticker_mod.update(sid, body.model_dump(exclude_unset=True))


@router.delete("/api/stickers/{sid}", response_model=S.Sticker, **OUT)
def delete_sticker(sid: int):
    return sticker_mod.remove(sid)


@router.post("/api/stickers/{sid}/restore", response_model=S.Sticker, **OUT)
def restore_sticker(sid: int):
    return sticker_mod.restore(sid)


@router.get("/api/sticker-groups", response_model=list[S.StickerGroupOut], **OUT)
def sticker_groups():
    return sticker_mod.load_groups()


class StickerGroup(BaseModel):
    id: int | None = None
    name: str
    ids: list[int] = []
    default: bool = False


@router.put("/api/sticker-groups", response_model=list[S.StickerGroupOut], **OUT)
def put_sticker_groups(body: list[StickerGroup]):
    return sticker_mod.save_groups([g.model_dump() for g in body])

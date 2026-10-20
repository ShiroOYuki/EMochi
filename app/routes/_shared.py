"""多個路由共用的請求格式"""

from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel

from ..images import decode_data_url


class Upload(BaseModel):
    """前端用 FileReader 讀成 data URL 傳上來，免裝 python-multipart"""

    name: str = "image.png"
    data: str
    role: str = "character"  # 暫時參考圖：character / style


Framing = Literal["closeup", "whole"]


class ProcessPatch(BaseModel):
    """後處理參數（project.json／style.json 的 process）；只會改有傳的欄位"""

    square: float | None = None  # None＝整顆入鏡
    margin: float | None = None
    min_blob: float | None = None


def _decode(files: list[Upload]) -> list[tuple[str, bytes, str]]:
    try:
        return [(f.name, decode_data_url(f.data), f.role) for f in files]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"圖片讀取失敗：{e}") from None

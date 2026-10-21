"""平台上傳規格：匯出前檢查尺寸與檔案大小，超過就壓縮

上限（2026-10-19 查）：
- Twitch 靜態表情：透明 PNG、正方形，112 / 56 / 28 三種尺寸，每個檔案 1 MB 以內
  （Elgato 整理的 Twitch 表情規格：https://developer.elgato.com/en/graphics/emotes）
- Discord 表情：256 KB 以內，可用 PNG / JPEG / GIF / WEBP
  （Discord 官方說明：https://support.discord.com/hc/articles/360036479811）
平台改規定時只要改 SPECS。
匯出改用預設集（presets.py）後，大小上限由每組預設集自己帶，壓縮共用 compress()。
"""

import io
from dataclasses import dataclass

from PIL import Image


@dataclass(frozen=True)
class Spec:
    label: str
    size: tuple[int, int] | None  # None＝不檢查尺寸
    max_bytes: int | None  # None＝不限


SPECS: dict[str, Spec] = {
    "t112": Spec("Twitch 112", (112, 112), 1024 * 1024),
    "t56": Spec("Twitch 56", (56, 56), 1024 * 1024),
    "t28": Spec("Twitch 28", (28, 28), 1024 * 1024),
    "discord": Spec("Discord", None, 256 * 1024),
    "master": Spec("Master 512", None, None),  # 備份用的母版，不上傳平台
}


def _png(im: Image.Image, **kw) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", **kw)
    return buf.getvalue()


def fit(data: bytes, fmt: str) -> tuple[bytes, list[str]]:
    """檢查一個檔案；回傳（要放進 zip 的內容, 說明）。說明是空的＝原檔就合格、原封不動。

    超過大小時依序嘗試，第一個符合的就用：
    1. 無損重新壓縮（optimize）
    2. 降成 256 色調色盤（保留透明度；小圖看不太出差別，但算有損）
    尺寸不對只提醒、不自動縮放（縮放會改到後處理的結果，應該回後處理修）。
    """
    spec = SPECS.get(fmt)
    if spec is None:
        return data, []
    notes: list[str] = []
    im = Image.open(io.BytesIO(data))
    if spec.size and im.size != spec.size:
        notes.append(f"尺寸 {im.size[0]}×{im.size[1]}，{spec.label} 應為 {spec.size[0]}×{spec.size[1]}")
    out, more = compress(data, spec.label, spec.max_bytes)
    return out, notes + more


def _kb(n: int) -> str:
    return f"{n / 1024:.1f} KB" if n < 10 * 1024 else f"{n // 1024} KB"


def compress(data: bytes, label: str, max_bytes: int | None) -> tuple[bytes, list[str]]:
    """超過 max_bytes 時依序嘗試，第一個符合的就用（None＝不限）：
    1. 無損重新壓縮（optimize）
    2. 降成 256 色調色盤（保留透明度；小圖看不太出差別，但算有損）"""
    if max_bytes is None or len(data) <= max_bytes:
        return data, []
    limit = _kb(max_bytes)
    im = Image.open(io.BytesIO(data))
    im.load()
    out = _png(im, optimize=True)
    if len(out) <= max_bytes:
        return out, [f"{_kb(len(data))} 超過 {label} 上限 {limit}，已無損壓縮到 {_kb(len(out))}"]
    q = im.convert("RGBA").quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    out2 = _png(q, optimize=True)
    if len(out2) <= max_bytes:
        return out2, [
            f"{_kb(len(data))} 超過 {label} 上限 {limit}，已降為 256 色壓縮到 {_kb(len(out2))}（有損）"
        ]
    return data, [f"{_kb(len(data))} 超過 {label} 上限 {limit}，壓縮後仍有 {_kb(len(out2))}，請手動處理"]

"""上傳圖片的共用處理：解析 data URL、正規化成 PNG、限制尺寸"""
import base64
import io
import re
from pathlib import Path

from PIL import Image

MAX_SIDE = 1536          # Codex 讀圖不需要更大，太大只會變慢、佔額度
MAX_BYTES = 30 * 1024 * 1024


def decode_data_url(data: str) -> bytes:
    m = re.match(r"^data:[^;]+;base64,(.*)$", data, re.S)
    raw = base64.b64decode(m.group(1) if m else data)
    if len(raw) > MAX_BYTES:
        raise ValueError("圖片超過 30 MB")
    return raw


def safe_stem(name: str) -> str:
    stem = Path(name or "image").stem
    stem = re.sub(r"[^\w\-]+", "_", stem, flags=re.UNICODE).strip("_")
    return stem[:40] or "image"


def save_png(raw: bytes, folder: Path, name: str, exact: str | None = None) -> str:
    """存成 PNG（保留透明）、長邊縮到 MAX_SIDE，回傳檔名。

    exact 有給就用這個檔名（呼叫端負責不重複）；否則用原檔名，重複時自動加編號"""
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"無法讀取圖片：{e}") from e
    im = im.convert("RGBA" if "A" in im.getbands() or im.mode == "P" else "RGB")
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    folder.mkdir(parents=True, exist_ok=True)
    stem, n = safe_stem(name), 1
    fname = exact or f"{stem}.png"
    while not exact and (folder / fname).exists():
        n += 1
        fname = f"{stem}_{n}.png"
    im.save(folder / fname, optimize=True)
    return fname


def move_to_removed(path: Path) -> None:
    """不直接刪檔：移到同層的 _removed/，誤刪還找得回來"""
    if not path.exists():
        return
    bin_ = path.parent / "_removed"
    bin_.mkdir(exist_ok=True)
    target = bin_ / path.name
    n = 1
    while target.exists():
        n += 1
        target = bin_ / f"{path.stem}_{n}{path.suffix}"
    path.replace(target)

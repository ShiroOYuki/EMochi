"""/files/：輸出、匯出、角色庫、畫風庫底下的檔案（含快取策略）"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response

from ..paths import from_url

router = APIRouter()


# 快取策略：
# - 網址帶 ?v=（前端 fileUrl 的版本號：檔案修改時間、專案 updated、組別 finished…）→ 內容換了網址就會跟著換，
#   所以可以放心讓瀏覽器存一年、期間完全不再詢問（immutable）
# - 沒帶 v 的 → 每次都要回來確認（no-cache），沒變就回 304、不重傳內容；比原本的 no-store（每次整份重下載）省很多，
#   又不會拿到舊圖
LONG_CACHE = "public, max-age=31536000, immutable"


REVALIDATE = "no-cache"


def _etag(p: Path) -> str:
    st = p.stat()
    return f'"{st.st_mtime_ns:x}-{st.st_size:x}"'


@router.get("/files/{path:path}")
def files(path: str, request: Request, v: str | None = None):
    """outputs/、exports/、characters/、style_lib/ 底下的檔案（圖片、zip、json）。
    網址的前綴固定，實際位置依設定（見 paths.URL_BASES）；跑出這些資料夾的路徑一律 404"""
    p = from_url(path)
    if p is None or not p.is_file():
        raise HTTPException(404)
    if p.suffix == ".zip":
        return FileResponse(p, filename=p.name, headers={"Cache-Control": "no-store"})
    # ETag 用修改時間（奈秒）＋大小：檔案一動就變。瀏覽器帶著舊 ETag 回來問、而且沒變 → 回 304，不重傳內容
    # （目前用的 Starlette 版本的 FileResponse 不會自己處理條件請求，所以在這裡判斷）
    etag = _etag(p)
    headers = {"Cache-Control": LONG_CACHE if v else REVALIDATE, "ETag": etag}
    if etag in [t.strip() for t in request.headers.get("if-none-match", "").split(",")]:
        return Response(status_code=304, headers=headers)
    return FileResponse(p, headers=headers)

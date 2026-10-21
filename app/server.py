"""FastAPI：/api/* 給前端用（路由依領域分在 app/routes/），其餘路徑回傳 React build（app/static）"""

import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import characters, jobs, style_lib
from .errors import AppError
from .paths import STATIC
from .routes import files, gallery, library, projects, settings, stickers, system

log = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(_app):
    characters.normalize_names()
    jobs.recover_interrupted()
    style_lib.seed_defaults()  # 全新安裝才會放進內建範例畫風
    yield


# separate_input_output_schemas=False：回應用 exclude_unset 輸出，有預設值的欄位可能不在回應裡，
# 產生的前端型別要標成可省略（用驗證模式的 schema）
app = FastAPI(title="EMochi", lifespan=_lifespan, separate_input_output_schemas=False)


@app.middleware("http")
async def _errors(request: Request, call_next):
    """各模組丟 app/errors.py 的例外回報錯誤，這裡統一轉成前端看得懂的 {detail}：
    NotFound → 404、Invalid → 400、Conflict → 409、CodexError → 502；
    其他例外是程式 bug → 500 並記 log（訊息照樣給前端，回報問題時看得到）。
    HTTPException、參數驗證錯誤（422）由 FastAPI 在更裡層處理，不會到這裡"""
    try:
        return await call_next(request)
    except AppError as e:
        if e.status >= 500:
            log.warning("%s %s：%s", request.method, request.url.path, e)
        return JSONResponse({"detail": str(e)}, e.status)
    except Exception as e:  # noqa: BLE001
        log.exception("%s %s 失敗", request.method, request.url.path)
        return JSONResponse({"detail": f"程式發生錯誤：{e}"}, 500)


LOCAL_HOSTS = {"127.0.0.1", "localhost"}


def _is_local(host: str | None) -> bool:
    return host is not None and host.lower() in LOCAL_HOSTS


@app.middleware("http")
async def _local_only(request: Request, call_next):
    """只接受本機頁面的請求（後面加的 middleware 在外層，比 _errors 先跑）。
    - Host 必須是 127.0.0.1／localhost：擋 DNS rebinding（惡意網域解析到 127.0.0.1 後，瀏覽器送的 Host 是那個網域）
    - 有 Origin 時也必須是本機：擋 CSRF（別的網站用 fetch／表單 POST 觸發生圖、Codex 登入）。
      Electron、網頁版、vite dev（localhost:5173 代理）都是本機 Origin；Electron 主程序、curl 不帶 Origin
    port 不檢查：DNS rebinding 的 Host 一定是對方網域，CSRF 的 Origin 一定是對方網站"""
    host = urlsplit("//" + request.headers.get("host", "")).hostname
    origin = request.headers.get("origin")
    if not _is_local(host) or (origin is not None and not _is_local(urlsplit(origin).hostname)):
        log.warning(
            "擋下非本機請求：%s %s（Host=%s Origin=%s）", request.method, request.url.path, host, origin
        )
        return JSONResponse({"detail": "只接受本機的請求"}, 403)
    return await call_next(request)


for r in (system, settings, stickers, files, projects, library, gallery):
    app.include_router(r.router)


# ---------- 前端 ----------

if (STATIC / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")


@app.get("/{full:path}")
def spa(full: str):
    # web/public/ 的檔案（favicon.svg 等）建置後放在 static/ 根目錄
    f = (STATIC / full).resolve()
    if full and f.parent == STATIC.resolve() and f.is_file():
        return FileResponse(f)
    index = STATIC / "index.html"
    if not index.exists():
        return JSONResponse({"error": "前端尚未建置：cd web && npm install && npm run build"}, 500)
    return FileResponse(index, headers={"Cache-Control": "no-store"})

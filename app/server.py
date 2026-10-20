"""FastAPI：/api/* 給前端用（路由依領域分在 app/routes/），其餘路徑回傳 React build（app/static）"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import characters, jobs, style_lib
from .errors import AppError
from .paths import STATIC
from .routes import files, gallery, library, projects, settings, stickers, system

log = logging.getLogger("emochi")


@asynccontextmanager
async def _lifespan(_app):
    characters.normalize_names()
    jobs.recover_interrupted()
    style_lib.seed_defaults()  # 全新安裝才會放進內建範例畫風
    yield


app = FastAPI(title="EMochi", lifespan=_lifespan)


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

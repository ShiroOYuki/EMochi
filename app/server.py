"""FastAPI：/api/* 給前端用，其餘路徑回傳 React build（app/static）"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import characters, codex_status, gallery, jobs, presets, prompts, settings, settings_ops, style_lib, trash, usage
from .images import decode_data_url
from . import stickers as sticker_mod
from .paths import ROOT, STATIC, exports_dir, from_url, load_stickers, logs_dir, next_style_id, read_json


@asynccontextmanager
async def _lifespan(_app):
    characters.normalize_names()
    jobs.recover_interrupted()
    style_lib.seed_defaults()   # 全新安裝才會放進內建範例畫風
    yield


app = FastAPI(title="EMochi", lifespan=_lifespan)


def _err(e: Exception):
    if isinstance(e, KeyError):
        raise HTTPException(404, f"找不到：{e}")
    raise HTTPException(400, str(e))


# ---------- 共用 ----------

class UiPrefs(BaseModel):
    theme: str


@app.get("/api/ui-prefs")
def get_ui_prefs():
    """介面偏好（主題）：存在 settings.local.json，不放瀏覽器的 localStorage——
    桌面版、不同 port、清快取都不會遺失。前端一載入就讀"""
    # stored：設定檔裡有沒有存過（沒有＝還是預設）。前端用來把舊版存在瀏覽器裡的選擇搬上來
    stored = "theme" in (read_json(settings.FILE, {}) or {})
    return {"theme": settings.get("theme"), "stored": stored}


@app.put("/api/ui-prefs")
def put_ui_prefs(body: UiPrefs):
    try:
        settings.save(settings.validate({"theme": body.theme}))
    except Exception as e:  # noqa: BLE001
        _err(e)
    return get_ui_prefs()


@app.get("/api/health")
def health():
    """桌面版（Electron）用：啟動時等它回應才開視窗；關閉前看有沒有 Codex 在跑"""
    from . import codex
    from .paths import FROZEN
    return {"ok": True, "root": str(ROOT), "frozen": FROZEN, "codex_running": len(codex.ACTIVE),
            "busy": settings_ops.busy()}


@app.get("/api/codex-usage")
def codex_usage(refresh: bool = False):
    return usage.rate_limits(force=refresh)


@app.get("/api/codex-status")
def get_codex_status(refresh: bool = False):
    """Codex 狀態對話框：連線、登入、額度、執行中、近 7 天 token；refresh＝重新連線（重查 CLI／登入／額度）"""
    return codex_status.status(force=refresh)


@app.get("/api/codex-check")
def get_codex_check(refresh: bool = False):
    """只查 CLI 與登入（不統計用量）：啟動時的 Codex 準備視窗用；refresh＝跳過 60 秒快取重查"""
    return codex_status.check(force=refresh)


@app.post("/api/codex-login")
def codex_login():
    try:
        return codex_status.start_login()
    except RuntimeError as e:
        _err(e)


# ---------- 設定 ----------

@app.get("/api/settings")
def get_settings():
    return settings_ops.info()


class PathCheck(BaseModel):
    key: str
    value: str = ""
    others: dict = {}


@app.post("/api/settings/check")
def check_setting_path(body: PathCheck):
    try:
        return settings_ops.check(body.key, body.value, body.others)
    except (KeyError, ValueError) as e:
        _err(e)


class SettingsChange(BaseModel):
    changes: dict
    move: bool = True
    conflict: str | None = None    # keep＝保留新位置的同名檔、overwrite＝覆蓋


@app.post("/api/settings/plan")
def plan_settings(body: SettingsChange):
    try:
        return settings_ops.plan(settings.validate(body.changes))
    except (KeyError, ValueError) as e:
        _err(e)


@app.put("/api/settings")
def put_settings(body: SettingsChange):
    try:
        return settings_ops.apply(body.changes, body.move, body.conflict)
    except (KeyError, ValueError, OSError) as e:
        _err(e)


class FolderBody(BaseModel):
    path: str = ""


@app.post("/api/settings/pick-folder")
def pick_folder(body: FolderBody):
    """在伺服器這台電腦上跳出資料夾選擇視窗（同步等使用者選完）"""
    try:
        return {"path": settings_ops.pick_folder(body.path)}
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/settings/open-folder")
def open_folder(body: FolderBody):
    try:
        return {"opened": settings_ops.open_folder(body.path)}
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.get("/api/stickers")
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


@app.post("/api/stickers")
def create_sticker(body: NewSticker):
    if not body.label.strip() or not body.prompt.strip():
        raise HTTPException(400, "名稱和英文描述都要填")
    try:
        return sticker_mod.add(body.label, body.zh, body.prompt, body.align, body.prompt_no_ears, body.group_id)
    except (KeyError, ValueError) as e:
        _err(e)


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


@app.post("/api/stickers/expand")
def expand_sticker(body: ExpandSticker):
    """讓 Codex 把一句話擴寫成表情設定（同步，約 10~30 秒）；只回傳建議，不存檔"""
    try:
        return sticker_mod.expand(body.idea, body.model_dump())
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.patch("/api/stickers/{sid}")
def patch_sticker(sid: int, body: StickerPatch):
    try:
        return sticker_mod.update(sid, body.model_dump(exclude_unset=True))
    except (KeyError, ValueError) as e:
        _err(e)


@app.delete("/api/stickers/{sid}")
def delete_sticker(sid: int):
    try:
        return sticker_mod.remove(sid)
    except KeyError as e:
        _err(e)


@app.post("/api/stickers/{sid}/restore")
def restore_sticker(sid: int):
    try:
        return sticker_mod.restore(sid)
    except KeyError as e:
        _err(e)


@app.get("/api/sticker-groups")
def sticker_groups():
    return sticker_mod.load_groups()


class StickerGroup(BaseModel):
    id: int | None = None
    name: str
    ids: list[int] = []
    default: bool = False


@app.put("/api/sticker-groups")
def put_sticker_groups(body: list[StickerGroup]):
    try:
        return sticker_mod.save_groups([g.model_dump() for g in body])
    except ValueError as e:
        _err(e)


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


@app.get("/files/{path:path}")
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


# ---------- Gen ----------

@app.get("/api/projects")
def projects():
    return {"projects": jobs.list_projects(), "next_id": next_style_id(),
            "preview_ids": prompts.template().get("preview_ids", []), "max_parallel": settings.get("max_parallel"),
            "default_layout": settings.get("default_layout")}


@app.get("/api/projects/{style}")
def project(style: str):
    p = jobs.load(style)
    if not p:
        raise HTTPException(404, f"找不到專案 {style}")
    return jobs.view(p)


@app.get("/api/trash/{kind}")
def trash_list(kind: str):
    try:
        return trash.list_items(kind)
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/trash/{kind}/{name}/restore")
def trash_restore(kind: str, name: str):
    try:
        return {"id": trash.restore(kind, name)}
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.delete("/api/trash/{kind}/{name}")
def trash_purge(kind: str, name: str):
    try:
        return {"deleted": trash.purge(kind, name)}
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.delete("/api/trash/{kind}")
def trash_empty(kind: str):
    try:
        return {"deleted": trash.purge(kind, None)}
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.delete("/api/projects/{style}")
def delete_project(style: str):
    try:
        jobs.delete(style)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        _err(e)


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
    style_lib_id: str | None = None


class ExpandBody(BaseModel):
    request: str


@app.post("/api/projects")
def create(body: CreateBody):
    try:
        return jobs.view(jobs.create(body.request, body.character_id, body.character_images, _decode(body.temp_refs), body.style_lib_id))
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


@app.delete("/api/characters/{cid}")
def delete_character(cid: str):
    try:
        characters.delete(cid)
        return {"ok": True}
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


# ---------- 畫風庫 ----------

@app.get("/api/style-lib")
def list_style_lib():
    return style_lib.list_all()


@app.get("/api/style-lib/importable")
def style_lib_importable():
    return style_lib.importable()


class NewLibStyle(BaseModel):
    name: str = ""
    request: str = ""
    images: list[Upload] = []
    analyze: bool = True


@app.post("/api/style-lib")
def create_lib_style(body: NewLibStyle):
    """建立＋（預設）立刻讓 Codex 分析；分析失敗時畫風仍會留著，回傳裡帶 error"""
    try:
        s = style_lib.create(body.name, [(n, d) for n, d, _ in _decode(body.images)], body.request)
    except Exception as e:  # noqa: BLE001
        _err(e)
    if not body.analyze:
        return s
    try:
        return style_lib.analyze(s["id"], jobs.style_examples())
    except Exception as e:  # noqa: BLE001
        return {**s, "error": f"分析失敗：{e}"}


class ImportBody(BaseModel):
    project: str


@app.post("/api/style-lib/import")
def import_lib_style(body: ImportBody):
    try:
        return style_lib.import_project(body.project)
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/projects/{style}/to-library")
def project_to_library(style: str):
    """把專案目前的畫風存進畫風庫：範例圖＝預覽圖＋專案的畫風參考圖"""
    p = jobs.load(style)
    if not p:
        raise HTTPException(404, f"找不到專案 {style}")
    try:
        return style_lib.import_project(style, jobs.ref_paths(p)["style"])
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.patch("/api/style-lib/{sid}")
def update_lib_style(sid: str, body: dict):
    try:
        return style_lib.update(sid, body)
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.delete("/api/style-lib/{sid}")
def delete_lib_style(sid: str):
    try:
        style_lib.delete(sid)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/style-lib/{sid}/images")
def add_lib_images(sid: str, files: list[Upload]):
    try:
        return style_lib.add_images(sid, [(n, d) for n, d, _ in _decode(files)])
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.delete("/api/style-lib/{sid}/images/{file}")
def remove_lib_image(sid: str, file: str):
    try:
        return style_lib.remove_image(sid, file)
    except Exception as e:  # noqa: BLE001
        _err(e)


class AnalyzeBody(BaseModel):
    request: str | None = None


@app.post("/api/style-lib/{sid}/analyze")
def analyze_lib_style(sid: str, body: AnalyzeBody):
    """同步等 Codex 看圖（約 30~90 秒）"""
    try:
        return style_lib.analyze(sid, jobs.style_examples(), body.request)
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
    layout: str = "4x2w"   # 4x2w（2:1 畫布、8 格，預設）或 3x2（3:2 畫布、6 格）


@app.post("/api/projects/{style}/generate")
def generate(style: str, body: GenBody):
    try:
        return jobs.view(jobs.start_generate(style, body.ids, body.layout))
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
    p = (ROOT / path).resolve()   # 專案裡記的 log 路徑：相對資料根目錄或絕對路徑
    if logs_dir().resolve() not in p.parents or not p.is_file():
        raise HTTPException(404)
    return {"text": p.read_text(encoding="utf-8", errors="replace")[-20000:]}


# ---------- Gallery ----------

@app.get("/api/gallery")
def gallery_styles():
    return gallery.scan()


class ExportBody(BaseModel):
    keys: list[str]
    presets: list[str] = []
    custom: dict | None = None      # 單次自訂（不存成預設集）
    formats: list[str] | None = None  # 舊版格式代號（t112、discord…），相容舊的呼叫
    tag: str = ""


@app.post("/api/gallery/export")
def export(body: ExportBody):
    if not body.keys:
        raise HTTPException(400, "請先勾選貼圖")
    try:
        return gallery.export(body.keys, body.presets, body.custom, body.tag, fmts=body.formats)
    except Exception as e:  # noqa: BLE001
        _err(e)


# ---------- 匯出預設集 ----------

class PresetsBody(BaseModel):
    presets: list[dict]


@app.get("/api/export-presets")
def get_presets():
    return {"presets": presets.load(), "custom": presets.is_custom()}


@app.put("/api/export-presets")
def put_presets(body: PresetsBody):
    try:
        return {"presets": presets.save(body.presets), "custom": True}
    except Exception as e:  # noqa: BLE001
        _err(e)


@app.post("/api/export-presets/reset")
def reset_presets():
    return {"presets": presets.reset(), "custom": False}


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
    presets: list[str] | None = None
    custom: dict | None = None
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
    return gallery.save_selection(body.keys, body.presets, body.custom, body.combine, body.tag, body.formats)


@app.get("/api/gallery/selections/{name}")
def get_selection(name: str):
    base = exports_dir().resolve()
    p = (base / name).resolve()
    if base not in p.parents or p.suffix != ".json" or not p.exists():
        raise HTTPException(404)
    return JSONResponse(read_json(p))


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

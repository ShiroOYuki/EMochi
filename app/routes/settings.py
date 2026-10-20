"""設定頁：資料夾位置、生成參數、選／開資料夾"""

from fastapi import APIRouter
from pydantic import BaseModel

from .. import settings, settings_ops

router = APIRouter()


@router.get("/api/settings")
def get_settings():
    return settings_ops.info()


class PathCheck(BaseModel):
    key: str
    value: str = ""
    others: dict = {}


@router.post("/api/settings/check")
def check_setting_path(body: PathCheck):
    return settings_ops.check(body.key, body.value, body.others)


class SettingsChange(BaseModel):
    changes: dict
    move: bool = True
    conflict: str | None = None  # keep＝保留新位置的同名檔、overwrite＝覆蓋


@router.post("/api/settings/plan")
def plan_settings(body: SettingsChange):
    return settings_ops.plan(settings.validate(body.changes))


@router.put("/api/settings")
def put_settings(body: SettingsChange):
    return settings_ops.apply(body.changes, body.move, body.conflict)


class FolderBody(BaseModel):
    path: str = ""


@router.post("/api/settings/pick-folder")
def pick_folder(body: FolderBody):
    """在伺服器這台電腦上跳出資料夾選擇視窗（同步等使用者選完）"""
    return {"path": settings_ops.pick_folder(body.path)}


@router.post("/api/settings/open-folder")
def open_folder(body: FolderBody):
    return {"opened": settings_ops.open_folder(body.path)}

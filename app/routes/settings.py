"""設定頁：資料夾位置、生成參數、選／開資料夾"""

from fastapi import APIRouter
from pydantic import BaseModel

from .. import schemas as S
from .. import settings, settings_ops
from ._shared import OUT

router = APIRouter()


@router.get("/api/settings", response_model=S.SettingsInfo, **OUT)
def get_settings():
    return settings_ops.info()


class PathCheck(BaseModel):
    key: str
    value: str = ""
    others: dict = {}


@router.post("/api/settings/check", response_model=S.PathCheckResult, **OUT)
def check_setting_path(body: PathCheck):
    return settings_ops.check(body.key, body.value, body.others)


class SettingsChange(BaseModel):
    changes: dict
    move: bool = True
    conflict: str | None = None  # keep＝保留新位置的同名檔、overwrite＝覆蓋


@router.post("/api/settings/plan", response_model=S.SettingsPlan, **OUT)
def plan_settings(body: SettingsChange):
    return settings_ops.plan(settings.validate(body.changes))


@router.put("/api/settings", response_model=S.SettingsInfo, **OUT)
def put_settings(body: SettingsChange):
    return settings_ops.apply(body.changes, body.move, body.conflict)


class FolderBody(BaseModel):
    path: str = ""


@router.post("/api/settings/pick-folder", response_model=S.PathResult, **OUT)
def pick_folder(body: FolderBody):
    """在伺服器這台電腦上跳出資料夾選擇視窗（同步等使用者選完）"""
    return {"path": settings_ops.pick_folder(body.path)}


@router.post("/api/settings/open-folder", response_model=S.Opened, **OUT)
def open_folder(body: FolderBody):
    return {"opened": settings_ops.open_folder(body.path)}

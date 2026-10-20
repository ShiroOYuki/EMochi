"""畫風專案（outputs/<style>/project.json）的資料形狀與狀態

project.json 仍是一般 dict（讀寫格式不變）；這裡的 TypedDict 只給型別檢查與閱讀用。
Status／ItemStatus 是 StrEnum：值就是原本的字串，存進 JSON、和舊檔比較都照常。
前端對應的型別在 web/src/api.ts（Project、Group、ProjectStatus、GroupStatus），改這裡要同步改那邊。
"""

from enum import StrEnum
from typing import Literal, NotRequired, TypedDict

from .errors import Conflict


class Status(StrEnum):
    """專案狀態（流程圖見 jobs/__init__.py）"""

    EXPANDING = "expanding"  # Codex 擴寫需求中
    DRAFT = "draft"  # 可編輯描述、參考圖，可以預覽
    PREVIEWING = "previewing"
    PREVIEW_READY = "preview_ready"  # 預覽完成，可以挑貼圖開始批次
    GENERATING = "generating"
    REVIEW = "review"  # 所有組別跑完，逐組審核／重生
    PROCESSING = "processing"  # 切割、去背、輸出各尺寸
    DONE = "done"


class ItemStatus(StrEnum):
    """預覽圖、每一組網格的狀態"""

    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


BUSY = frozenset({Status.EXPANDING, Status.PREVIEWING, Status.GENERATING, Status.PROCESSING})
EDITABLE = frozenset({Status.DRAFT, Status.PREVIEW_READY})

Framing = Literal["closeup", "whole"]
RefRole = Literal["character", "style"]


class Process(TypedDict):
    """後處理參數（pipeline.cut_cells）"""

    square: float | None  # 特寫時每格裁成同樣大小的正方形；None＝整顆入鏡，各自裁到內容
    margin: float
    min_blob: float


class TempRef(TypedDict):
    file: str  # outputs/<style>/refs/ 底下的檔名
    role: RefRole


class Refs(TypedDict):
    character_id: str | None
    character_images: list[str] | None  # None＝用角色庫預設勾選的圖；[]＝一張都不用
    temp: list[TempRef]


class RefPaths(TypedDict):
    """jobs.ref_paths() 整理好、要附給 Codex 的參考圖（路徑相對於資料根目錄）"""

    character: list[str]
    style: list[str]
    identity: str  # 角色庫的特徵句；沒選角色是空字串
    ears: bool  # 角色有沒有獸耳（影響表情 prompt 用哪一句）


class GridItem(TypedDict):
    """預覽圖和每一組共用的欄位"""

    image: str  # 邏輯路徑 outputs/<style>/grids/...
    ids: list[int]
    prompt: str
    refs: list[str]
    layout: str
    status: ItemStatus
    message: str
    started: NotRequired[str]
    finished: NotRequired[str]
    log: NotRequired[str]
    rechecked: NotRequired[str]  # 最後一次「重新檢查」的時間
    accepted: NotRequired[bool]  # 使用者手動通過


class Group(GridItem):
    index: int  # 從 1 開始
    attempts: int


class Project(TypedDict):
    id: str  # s1、s2…
    name: str
    request: str  # 使用者的中文描述
    style_block: str  # 給生圖模型的畫風描述
    framing: Framing
    process: Process
    notes_zh: str
    refs: Refs
    status: Status
    error: str | None
    created: str
    updated: NotRequired[str]
    preview: GridItem | None
    sticker_ids: list[int]
    groups: list[Group]
    group_layout: NotRequired[str]
    finished_ids: NotRequired[list[int]]
    finished: NotRequired[str]
    style_lib_id: NotRequired[str]
    schema_version: NotRequired[int]  # app/migrations.py；讀檔時一定會補成最新版


def require_status(p: Project, allowed: frozenset[Status] | set[Status], action: str) -> None:
    """專案不在 allowed 狀態時丟 ValueError「目前狀態 X 不能<action>」"""
    if p["status"] not in allowed:
        raise Conflict(f"目前狀態 {p['status']} 不能{action}")

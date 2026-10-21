"""API 回應的形狀（route 的 response_model）：前端型別由這裡自動產生（npm run gen:api → schema.d.ts）

- 輸出時用 response_model_exclude_unset（routes/_shared.py 的 OUT）：原本 dict 裡沒有的鍵不會多出 null，
  回應內容跟加 model 之前一樣
- 預設 extra="ignore"：真的漏寫欄位時不會讓 API 掛掉，但那個欄位會被丟掉；
  測試時設 EMOCHI_STRICT_SCHEMAS=1 改成 extra="forbid"（tests/conftest.py），漏寫就會測不過
- 改這裡之後要跑 npm run gen:api，前端 api/types.ts 用的就是產生的型別
"""

import os
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

STRICT = os.environ.get("EMOCHI_STRICT_SCHEMAS") == "1"


class Out(BaseModel):
    model_config = ConfigDict(extra="forbid" if STRICT else "ignore")


ProjectStatus = Literal[
    "expanding", "draft", "previewing", "preview_ready", "generating", "review", "processing", "done"
]
ItemStatus = Literal["pending", "running", "done", "failed"]
Framing = Literal["closeup", "whole"]
RefRole = Literal["character", "style"]


class Ok(Out):
    ok: bool


# ---------- 生成：專案 ----------


class Process(Out):
    square: float | None
    margin: float
    min_blob: float = 0.0003


class TempRef(Out):
    file: str
    role: RefRole


class ProjectRefs(Out):
    character_id: str | None
    character_images: list[str] | None
    temp: list[TempRef]


class RefPaths(Out):
    character: list[str]
    style: list[str]
    identity: str
    ears: bool


class GridItem(Out):
    """預覽圖、每一組網格共用的欄位"""

    image: str
    ids: list[int]
    prompt: str
    refs: list[str] = []
    layout: str
    status: ItemStatus
    message: str = ""
    started: str | None = None
    finished: str | None = None
    log: str | None = None
    tokens: int | None = None
    rechecked: str | None = None  # 最後一次「重新檢查」的時間
    accepted: bool | None = None  # 使用者手動通過


class Group(GridItem):
    index: int
    attempts: int = 0


class Project(Out):
    """jobs.view() 的結果：project.json＋整理過的參考圖（ref_paths）＋每張圖的 tokens"""

    id: str
    name: str
    request: str
    style_block: str
    framing: Framing
    process: Process
    notes_zh: str
    refs: ProjectRefs
    status: ProjectStatus
    error: str | None
    created: str
    updated: str = ""
    preview: GridItem | None
    sticker_ids: list[int]
    groups: list[Group]
    group_layout: str | None = None
    finished_ids: list[int] | None = None
    finished: str | None = None
    style_lib_id: str | None = None
    schema_version: int | None = None
    ref_paths: RefPaths


class ProjectSummary(Out):
    id: str
    name: str
    status: ProjectStatus
    updated: str | None
    request: str
    character_id: str | None


class ProjectList(Out):
    projects: list[ProjectSummary]
    next_id: str
    preview_ids: list[int]
    max_parallel: int
    default_layout: Literal["4x2w", "3x2"] | None = None


class PromptPreview(Out):
    prompt: str
    ids: list[int]
    output: str
    refs: list[str]


class LogText(Out):
    text: str


# ---------- 角色庫、畫風庫 ----------


class CharImage(Out):
    file: str
    use: bool
    source: str | None = None


class Character(Out):
    id: str
    name: str
    identity: str
    notes_zh: str
    ears: bool | None = None  # None＝由特徵句自動判斷
    images: list[CharImage]
    next_index: int = 1
    created: str
    updated: str
    schema_version: int | None = None


class LibProcess(Out):
    square: float | None
    margin: float


class LibStyle(Out):
    id: str
    name: str
    request: str
    style_block: str
    framing: Framing
    process: LibProcess
    notes_zh: str
    images: list[CharImage]
    source_project: str | None
    next_index: int = 1
    created: str
    updated: str
    schema_version: int | None = None
    error: str | None = None  # 只有「建立並分析」分析失敗時才會帶


class Importable(Out):
    id: str
    name: str
    image: str | None
    imported: bool
    needs_analyze: bool | None = None


# ---------- 圖庫、匯出 ----------


class GalleryItem(Out):
    id: int
    name: str
    label: str
    zh: str
    files: dict[str, str]
    mtime: int | float


class GalleryStyle(Out):
    id: str
    name: str
    items: list[GalleryItem]
    character_id: str | None
    character_name: str


class SelectionInfo(Out):
    file: str
    count: int
    created: str
    kind: str
    tag: str | None


class ExportIssue(Out):
    file: str
    notes: list[str]


class ExportResult(Out):
    file: str
    count: int
    issues: list[ExportIssue]


class FileResult(Out):
    file: str
    count: int | None = None


class PresetSize(Out):
    w: int
    h: int


class ExportPreset(Out):
    id: str
    name: str
    group: str  # 通常是平台名稱；空白＝「其他」
    folder: str
    sizes: list[PresetSize]
    mode: Literal["fit", "canvas"]  # fit：等比縮進框內；canvas：剛好寬×高的透明畫布
    margin: int | float
    even: bool
    max_kb: int | None  # 每個檔案的上限；None＝不限
    naming: Literal["keep", "index"]  # index：01.png、02.png…（LINE）
    note: str


class PresetState(Out):
    presets: list[ExportPreset]
    custom: bool


# ---------- 表情 ----------


class Sticker(Out):
    id: int
    name: str  # 檔名用，建立後不變
    label: str
    zh: str
    prompt: str
    prompt_no_ears: str | None = None
    custom: bool | None = None
    align: str | None = None  # "bottom"＝切圖時貼齊底部
    deleted: bool | None = None  # 軟刪除（只有 ?all=1 才拿得到）
    example: str | None = None  # 範例圖檔名（/files/sticker_examples/<example>）
    example_v: int | None = None  # 範例圖換過的時間，給前端避免快取舊圖


class StickerDraft(Out):
    """Codex 擴寫的結果"""

    label: str
    zh: str
    prompt: str
    prompt_no_ears: str
    align: str | None


class StickerGroupOut(Out):
    id: int
    name: str
    ids: list[int]
    default: bool  # Gen 新專案預設勾選


# ---------- 設定 ----------

DirKey = Literal["outputs_dir", "logs_dir", "config_dir", "exports_dir", "characters_dir", "style_lib_dir"]


class DirInfo(Out):
    key: DirKey
    label: str
    desc: str
    value: str
    default: str
    path: str
    exists: bool
    files: int
    size: int


class SettingsValues(Out):
    max_parallel: int
    default_layout: Literal["4x2w", "3x2"]
    image_timeout_min: int
    text_timeout_min: int
    tour_done: bool
    notify: bool
    theme: Literal["system", "light", "dark"]
    codex_args: list[str]


class MoveReport(Out):
    key: DirKey
    moved: int
    skipped: int


class SettingsReport(Out):
    moved: list[MoveReport]
    projects_updated: int


class SettingsInfo(Out):
    dirs: list[DirInfo]
    values: SettingsValues
    defaults: SettingsValues
    limits: dict[str, tuple[int, int]]
    layouts: list[str]
    themes: list[str]
    settings_file: str
    root: str
    busy: str | None
    codex_command: list[str]
    report: SettingsReport | None = None  # 只有 PUT（套用）時才有


class PathCheckResult(Out):
    key: DirKey
    value: str
    path: str
    exists: bool
    files: int
    size: int
    error: str | None
    warn: str | None


class PlanDir(Out):
    key: DirKey
    label: str
    from_: str = Field(alias="from")  # from 是 Python 保留字；JSON 裡照樣叫 from
    to: str
    files: int
    size: int
    conflicts: list[str]
    conflict_count: int


class SettingsPlan(Out):
    dirs: list[PlanDir]
    errors: list[str]
    busy: str | None


class PathResult(Out):
    path: str | None


class Opened(Out):
    opened: str  # 實際打開的資料夾（路徑不存在時往上找到存在的那層）


# ---------- 系統、Codex ----------


class UiPrefsOut(Out):
    theme: Literal["system", "light", "dark"]
    stored: bool  # 主題是否存過（沒存過才搬瀏覽器的舊值）
    tour_done: bool
    notify: bool


class AppEvent(Out):
    seq: int
    kind: Literal["preview", "batch"]
    project: str
    title: str
    body: str
    ok: bool
    time: float


class EventsResp(Out):
    boot: str
    seq: int
    events: list[AppEvent]


class Health(Out):
    ok: bool
    root: str
    frozen: bool
    codex_running: int
    busy: str | None


class Diagnostics(Out):
    version: str
    os: str
    codex: str
    mode: str
    text: str  # 整份可複製的純文字


class RateWindow(Out):
    used_percent: float
    window_minutes: int | None
    resets_at: float | None
    expired: bool | None = None  # 重置時間已經過了（以 0% 顯示，下次跑 Codex 才更新）


class CodexUsage(Out):
    """ChatGPT 方案的額度：primary＝5 小時窗口、secondary＝每週；時間都是 unix 秒"""

    available: bool
    primary: RateWindow | None
    secondary: RateWindow | None
    plan_type: str | None
    updated: float | None
    message: str
    source: str | None = None
    now: float


class CodexCli(Out):
    found: bool
    path: str | None = None
    version: str | None = None
    error: str | None = None


class CodexLogin(Out):
    ok: bool
    text: str
    pending: bool


class CodexCheck(Out):
    cli: CodexCli
    login: CodexLogin
    checked_at: float | None = None


class CodexRunning(Out):
    scope: str
    scope_label: str
    kind: str
    name: str
    seconds: int


class CodexTally(Out):
    key: str
    label: str
    tokens: int
    runs: int


class CodexDaily(Out):
    date: str
    tokens: int
    runs: int
    by_kind: dict[str, int]


class CodexRun(Out):
    time: str
    date: str
    scope: str
    scope_label: str
    name: str
    kind: str
    tokens: int | None
    seconds: int | None
    result: Literal["ok", "failed", "timeout", "running", "unknown"]
    log: str


class CodexUsageDays(Out):
    days: int
    daily: list[CodexDaily]
    by_kind: list[CodexTally]
    by_scope: list[CodexTally]
    total_tokens: int
    runs: int
    failed: int
    avg_grid_tokens: int | None
    recent: list[CodexRun]


class CodexStatus(CodexCheck):
    rate: CodexUsage
    sessions_dir: str
    sessions_found: bool
    running: list[CodexRunning]
    usage: CodexUsageDays


class LoginStarted(Out):
    started: bool
    message: str


# ---------- 垃圾桶 ----------


class TrashItem(Out):
    name: str  # 資料夾名 <id>_<刪除時間>
    id: str
    title: str
    status: ProjectStatus | None
    removed: str
    size: int
    thumb: str | None  # 可用 /files/ 顯示的縮圖
    restorable: bool


class Restored(Out):
    id: str


class Deleted(Out):
    deleted: int

"""Gen 流程的狀態機（每個畫風一個專案，狀態存在 outputs/<style>/project.json）

draft ──(預覽)──> previewing ──> preview_ready ──(確認風格＋選貼圖)──> generating
  ^  \\__(擴寫中 expanding)                        |                          |
  |                                               └──(改描述再預覽)            v
  └────────────────────────────────────────────────────────────────────── review
                                                     (重生某組 / 全部確認) ──> processing ──> done

模組分工：
- store：project.json 讀寫、鎖、清單、刪除
- refs：參考圖整理、view()
- prompting：組 prompt
- runner：背景執行（執行緒池、呼叫 Codex、後處理、通知）
- flow：使用者操作對應的狀態轉換（routes/projects.py 呼叫的大多在這裡）
外部一律用 `from app import jobs` 再 `jobs.xxx`，不要直接 import 子模組。
"""

from ..project_types import BUSY, EDITABLE
from .flow import (
    _failed_item,
    _mark_done,
    accept,
    create,
    recheck,
    reexpand,
    regenerate_group,
    reopen,
    start_finalize,
    start_generate,
    start_preview,
    update,
)
from .prompting import STYLE_EXAMPLES, cells_for, group_prompt, preview_prompt, style_examples
from .refs import _role, _with_tokens, add_temp_refs, ref_paths, refs_of, temp_dir, update_temp_ref, view
from .runner import _expand, _finalize, _gen_slot, _notify_batch, _pool, _run_group, _run_preview
from .store import (
    _group,
    _label,
    _lock,
    _locks,
    backup,
    delete,
    list_projects,
    load,
    mutate,
    now,
    project_path,
    recover_interrupted,
    rel,
    save,
)

__all__ = [
    "BUSY",
    "EDITABLE",
    "_locks",
    "_lock",
    "now",
    "project_path",
    "load",
    "save",
    "mutate",
    "list_projects",
    "delete",
    "recover_interrupted",
    "rel",
    "backup",
    "_group",
    "_label",
    "_role",
    "temp_dir",
    "refs_of",
    "view",
    "_with_tokens",
    "ref_paths",
    "add_temp_refs",
    "update_temp_ref",
    "STYLE_EXAMPLES",
    "style_examples",
    "cells_for",
    "preview_prompt",
    "group_prompt",
    "_pool",
    "_gen_slot",
    "_expand",
    "_run_preview",
    "_run_group",
    "_notify_batch",
    "_finalize",
    "create",
    "reexpand",
    "update",
    "start_preview",
    "start_generate",
    "regenerate_group",
    "start_finalize",
    "_failed_item",
    "_mark_done",
    "recheck",
    "accept",
    "reopen",
]

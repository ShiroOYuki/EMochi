"""背景執行：執行緒池、同時生圖組數上限，以及擴寫／預覽／每一組／收尾實際呼叫 Codex 與後處理的部分"""

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

from .. import codex, events, pipeline, prompts, settings
from ..paths import (
    data_path,
)
from ..project_types import (
    ItemStatus,
    Project,
    Status,
)
from .prompting import style_examples
from .refs import ref_paths
from .store import (
    _group,
    _label,
    backup,
    load,
    mutate,
    now,
    rel,
)

_pool = ThreadPoolExecutor(max_workers=8)  # 生圖組數另外由 _gen_slot() 限制；多出來的給擴寫、後處理


# 同時生圖組數：設定頁的 max_parallel，改了立即生效（等待中的組每 2 秒重看一次上限）
_slots = threading.Condition()


_running_gen = 0


@contextmanager
def _gen_slot():
    global _running_gen
    with _slots:
        while _running_gen >= max(1, int(settings.get("max_parallel"))):
            _slots.wait(timeout=2)
        _running_gen += 1
    try:
        yield
    finally:
        with _slots:
            _running_gen -= 1
            _slots.notify_all()


def _expand(style: str) -> None:
    try:
        proj = load(style)
        schema = codex.logs_dir() / style / "expand_schema.json"
        schema.parent.mkdir(parents=True, exist_ok=True)
        prompts.write_schema(schema)
        style_refs = ref_paths(proj)["style"]
        answer = codex.run_text(
            prompts.expand_request_prompt(proj["request"], style_examples(), style_refs),
            schema,
            codex.log_path_for(style, "expand"),
            images=style_refs,
        )
        data = json.loads(answer)

        def change(proj):
            proj.update(
                name=data["name"],
                style_block=data["style_block"],
                framing=data["framing"],
                notes_zh=data.get("notes_zh", ""),
                status=Status.DRAFT,
                error=None,
            )
            proj["process"].update(square=data.get("square"), margin=data.get("margin", 0))

        mutate(style, change)
    except Exception as e:  # noqa: BLE001
        err = f"擴寫失敗：{e}"  # e 離開 except 就被刪掉，先存成字串再給 lambda
        mutate(style, lambda proj: proj.update(status=Status.DRAFT, error=err))


def _run_preview(style: str) -> None:
    proj = load(style)
    preview = proj["preview"]
    backup(data_path(preview["image"]))
    log = codex.log_path_for(style, "preview")
    try:
        ok, msg = codex.run_image(
            preview["prompt"], preview.get("refs") or [], preview["image"], preview["layout"], log
        )
    except Exception as e:  # noqa: BLE001
        ok, msg = False, str(e)

    def change(proj):
        proj["preview"].update(
            status=ItemStatus.DONE if ok else ItemStatus.FAILED, message=msg, log=rel(log), finished=now()
        )
        proj["status"] = Status.PREVIEW_READY if ok else Status.DRAFT
        proj["error"] = None if ok else f"預覽失敗：{msg}"

    proj = mutate(style, change)
    events.emit(
        "preview",
        style,
        "預覽圖完成" if ok else "預覽圖失敗",
        _label(proj) + ("：可以確認風格、挑選貼圖了" if ok else f"：{msg}"),
        ok,
    )


def _run_group(style: str, index: int) -> None:
    with _gen_slot():  # 最多同時跑 max_parallel 組（設定頁）

        def start(proj):
            group = _group(proj, index)
            group.update(status=ItemStatus.RUNNING, started=now(), attempts=group.get("attempts", 0) + 1)

        proj = mutate(style, start)
        group = _group(proj, index)
        backup(data_path(group["image"]))
        log = codex.log_path_for(style, f"g{index}")
        try:
            ok, msg = codex.run_image(
                group["prompt"], group.get("refs") or [], group["image"], group["layout"], log
            )
        except Exception as e:  # noqa: BLE001
            ok, msg = False, str(e)

    finished = []  # 這次讓整批跑完的那一組才發通知（鎖內判斷，同時結束的兩組不會都發）

    def change(proj):
        group = _group(proj, index)
        group.update(
            status=ItemStatus.DONE if ok else ItemStatus.FAILED, message=msg, log=rel(log), finished=now()
        )
        if all(x["status"] in (ItemStatus.DONE, ItemStatus.FAILED) for x in proj["groups"]):
            if proj["status"] != Status.REVIEW:
                finished.append(True)
            proj["status"] = Status.REVIEW

    proj = mutate(style, change)
    if finished:
        _notify_batch(proj)


def _notify_batch(proj: Project) -> None:
    gs = proj["groups"]
    bad = [group["index"] for group in gs if group["status"] == ItemStatus.FAILED]
    if not bad:
        events.emit(
            "batch", proj["id"], "生成完成", f"{_label(proj)}：{len(gs)} 組全部成功，可以檢查後收尾", True
        )
    elif len(bad) == len(gs):
        events.emit("batch", proj["id"], "生成失敗", f"{_label(proj)}：{len(gs)} 組都失敗了", False)
    else:
        events.emit(
            "batch",
            proj["id"],
            "生成完成（有失敗）",
            f"{_label(proj)}：{len(gs) - len(bad)} 組成功，第 {'、'.join(map(str, bad))} 組失敗",
            False,
        )


def _finalize(style: str) -> None:
    try:
        proj = load(style)
        made = []
        for group in proj["groups"]:
            if group["status"] == ItemStatus.DONE:
                made += pipeline.process_grid(
                    style, data_path(group["image"]), group["layout"], group["ids"], proj["process"]
                )
        pipeline.build_previews(style)
        mutate(
            style, lambda proj: proj.update(status=Status.DONE, finished_ids=made, error=None, finished=now())
        )
    except Exception as e:  # noqa: BLE001
        err = f"後處理失敗：{e}"
        mutate(style, lambda proj: proj.update(status=Status.REVIEW, error=err))

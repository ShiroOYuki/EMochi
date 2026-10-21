"""使用者操作觸發的狀態轉換（流程圖見 jobs/__init__.py）：檢查狀態 → 改 project.json → 丟給 runner 背景執行"""

from pathlib import Path

from .. import characters, codex, prompts, style_lib
from ..errors import Conflict, Invalid, NotFound
from ..images import save_png
from ..migrations import PROJECT_VERSION
from ..paths import (
    data_path,
    next_style_id,
    sticker_map,
)
from ..project_types import (
    EDITABLE,
    GridItem,
    ItemStatus,
    Project,
    Status,
    require_status,
)
from .prompting import group_prompt, preview_prompt
from .refs import _role, refs_of, temp_dir
from .runner import _expand, _finalize, _pool, _run_group, _run_preview
from .store import _group, _lock, mutate, now, save


def create(
    request: str,
    character_id: str | None = None,
    character_images: list[str] | None = None,
    temp: list[tuple[str, bytes, str]] | None = None,
    style_lib_id: str | None = None,
) -> Project:
    """temp = [(檔名, 圖片 bytes, role)]，role 是 "character" 或 "style"

    style_lib_id：直接套用畫風庫的畫風 → 不擴寫，描述照抄、勾選的範例圖當畫風參考圖，直接進入 draft"""
    if character_id and not characters.get(character_id):
        raise NotFound(f"角色 {character_id}")
    lib = style_lib.get(style_lib_id) if style_lib_id else None
    if style_lib_id and not lib:
        raise NotFound(f"畫風庫 {style_lib_id}")
    if lib and not lib.get("style_block", "").strip():
        raise Invalid("這個畫風還沒有描述，請先到「畫風」分頁讓 Codex 分析")
    if not lib and not request.strip() and not any(_role(role) == "style" for _, _, role in temp or []):
        raise Invalid("請描述想要的畫風，或上傳畫風參考圖")
    style = next_style_id()
    proj = {
        "id": style,
        "name": "",
        "request": request.strip(),
        "style_block": "",
        "framing": "closeup",
        "process": {"square": 0.5, "margin": 0, "min_blob": 0.0003},
        "notes_zh": "",
        "refs": {"character_id": character_id, "character_images": character_images, "temp": []},
        "status": Status.EXPANDING,
        "error": None,
        "created": now(),
        "preview": None,
        "sticker_ids": [],
        "schema_version": PROJECT_VERSION,
        "groups": [],
    }
    if lib:
        proj.update(
            name=lib["name"],
            request=lib.get("request", ""),
            style_block=lib["style_block"],
            framing=lib["framing"],
            notes_zh=lib.get("notes_zh", ""),
            status=Status.DRAFT,
            style_lib_id=lib["id"],
        )
        proj["process"].update(square=lib["process"].get("square"), margin=lib["process"].get("margin", 0))
        # 檔名加上畫風庫 id（st1_ref_01.png），在專案參考圖裡和角色圖分得出來
        temp = [
            *(
                (f"{lib['id']}_{Path(path).name}", data_path(path).read_bytes(), "style")
                for path in style_lib.rel_paths(lib["id"])
            ),
            *(temp or []),
        ]
    for name, raw, role in temp or []:
        proj["refs"]["temp"].append({"file": save_png(raw, temp_dir(style), name), "role": _role(role)})
    with _lock(style):
        save(proj)
    if not lib:
        _pool.submit(_expand, style)
    return proj


def reexpand(style: str, request: str) -> Project:
    def change(proj):
        require_status(proj, EDITABLE, "重新擴寫")
        proj.update(request=request.strip(), status=Status.EXPANDING, error=None)

    proj = mutate(style, change)
    _pool.submit(_expand, style)
    return proj


def update(style: str, fields: dict) -> Project:
    allowed = {"name", "style_block", "framing", "request"}

    def change(proj):
        require_status(proj, EDITABLE, "修改")
        for k in allowed & fields.keys():
            proj[k] = fields[k]
        if "process" in fields:
            proj["process"].update(
                {k: v for k, v in fields["process"].items() if k in ("square", "margin", "min_blob")}
            )
        if "character_id" in fields or "character_images" in fields:
            refs = refs_of(proj)
            if "character_id" in fields:
                cid = fields["character_id"] or None
                if cid and not characters.get(cid):
                    raise NotFound(f"角色 {cid}")
                if cid != refs.get("character_id"):
                    refs["character_images"] = None  # 換角色 → 先用該角色的預設圖
                refs["character_id"] = cid
            if "character_images" in fields:
                refs["character_images"] = fields["character_images"]
            proj["refs"] = refs

    return mutate(style, change)


def start_preview(style: str) -> Project:
    def change(proj):
        require_status(proj, EDITABLE, "預覽")
        if not proj["style_block"].strip():
            raise Invalid("畫風描述是空的")
        text, ids, out, refs = preview_prompt(proj)
        proj["preview"] = {
            "image": out,
            "ids": ids,
            "prompt": text,
            "refs": refs,
            "layout": prompts.layout_for(len(ids)),
            "status": ItemStatus.RUNNING,
            "message": "",
            "started": now(),
        }
        proj.update(status=Status.PREVIEWING, error=None)

    proj = mutate(style, change)
    _pool.submit(_run_preview, style)
    return proj


def start_generate(style: str, ids: list[int], layout: str = "4x2w") -> Project:
    if layout not in prompts.GROUP_LAYOUTS:
        raise Invalid(f"不支援的版型 {layout}")
    meta = sticker_map()
    # 已刪除的表情不能再排進新的批次（已經在跑的組別重生不受影響）
    ids = [i for i in dict.fromkeys(ids) if i in meta and not meta[i].get("deleted")]
    if not ids:
        raise Invalid("請至少選一張貼圖")

    def change(proj):
        if proj["status"] != Status.PREVIEW_READY:
            raise Conflict("請先產生並確認風格預覽圖")
        groups = []
        for n, chunk in enumerate(prompts.chunk(ids, prompts.GROUP_LAYOUTS[layout]), 1):
            grid_layout = prompts.layout_for_group(len(chunk), layout)
            text, out, refs = group_prompt(proj, n, chunk, grid_layout)
            groups.append(
                {
                    "index": n,
                    "ids": chunk,
                    "layout": grid_layout,
                    "prompt": text,
                    "refs": refs,
                    "image": out,
                    "status": ItemStatus.PENDING,
                    "message": "",
                    "attempts": 0,
                }
            )
        proj.update(sticker_ids=ids, groups=groups, group_layout=layout, status=Status.GENERATING, error=None)

    proj = mutate(style, change)
    for group in proj["groups"]:
        _pool.submit(_run_group, style, group["index"])
    return proj


def regenerate_group(style: str, index: int) -> Project:
    def change(proj):
        require_status(proj, {Status.REVIEW, Status.GENERATING}, "重生")
        group = _group(proj, index)
        if group["status"] in (ItemStatus.PENDING, ItemStatus.RUNNING):
            raise Conflict("這組還在執行中")
        group.update(status=ItemStatus.PENDING, message="")
        group.pop("accepted", None)
        group.pop("rechecked", None)
        proj["status"] = Status.GENERATING

    proj = mutate(style, change)
    _pool.submit(_run_group, style, index)
    return proj


def start_finalize(style: str) -> Project:
    def change(proj):
        if proj["status"] != Status.REVIEW:
            raise Conflict("還有組別在生成中")
        if not any(group["status"] == ItemStatus.DONE for group in proj["groups"]):
            raise Conflict("沒有成功的組別可以處理")
        proj.update(status=Status.PROCESSING, error=None)

    proj = mutate(style, change)
    _pool.submit(_finalize, style)
    return proj


def _failed_item(proj: Project, target: str) -> GridItem:
    """target = "preview" 或組別編號；只接受目前是失敗的"""
    if target == "preview":
        item = proj.get("preview")
        if not item or item.get("status") != ItemStatus.FAILED:
            raise Conflict("預覽圖沒有失敗，不需要處理")
    else:
        item = _group(proj, int(target))
        if item["status"] != ItemStatus.FAILED:
            raise Conflict("這組沒有失敗，不需要處理")
    return item


def _mark_done(proj: Project, target: str, item: GridItem, msg: str) -> None:
    item.update(status=ItemStatus.DONE, message=msg)
    if target == "preview" and proj["status"] in EDITABLE:
        proj.update(status=Status.PREVIEW_READY, error=None)


def recheck(style: str, target: str) -> Project:
    """不重新生成，只用目前的檢查規則重新檢查已經存在的圖（例如規則改過、或被誤判失敗）。
    還是沒過時訊息不變，記下 rechecked 時間，前端才看得出有檢查過"""

    def change(proj):
        item = _failed_item(proj, target)
        ok, msg = codex.check_image(data_path(item["image"]), None, item["layout"])
        item["rechecked"] = now()
        if ok:
            _mark_done(proj, target, item, msg)
        else:
            item["message"] = msg
            if target == "preview":
                proj["error"] = f"預覽失敗：{msg}"

    return mutate(style, change)


def accept(style: str, target: str) -> Project:
    """使用者看過圖、判斷沒問題：不管自動檢查的結果，直接當成成功（accepted＝手動通過）。
    圖檔一定要在、打得開；之後收尾照常切割、去背，重生會清掉這個標記"""

    def change(proj):
        item = _failed_item(proj, target)
        path = data_path(item["image"])
        if not path.exists():
            raise Invalid("圖檔不存在，只能重新生成")
        try:
            from PIL import Image

            with Image.open(path) as im:
                im.load()
        except Exception as e:  # noqa: BLE001
            raise Invalid(f"圖檔打不開，只能重新生成：{e}") from None
        item["accepted"] = True
        _mark_done(proj, target, item, f"手動通過（自動檢查：{item.get('message') or '未通過'}）")

    return mutate(style, change)


def reopen(style: str) -> Project:
    """已完成的專案回到審核階段（例如想再重生某組）"""

    def change(proj):
        if proj["status"] != Status.DONE:
            raise Conflict("只有已完成的專案可以重新開啟")
        proj["status"] = Status.REVIEW

    return mutate(style, change)

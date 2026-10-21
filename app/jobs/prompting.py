"""prompt 組裝：預覽圖、每一組網格要送給 Codex 的文字與附圖"""

from .. import prompts, style_lib
from ..paths import (
    BUILTIN_CONFIG,
    read_json,
    sticker_map,
)
from ..project_types import (
    Project,
)
from .refs import ref_paths

# 擴寫、分析畫風時給 Codex 看的範例描述（內建，跟著程式走）：以前直接讀使用者的 s5、s4 專案，
# 別人的電腦（桌面版）沒有這些專案就沒範例；改成 config/style_examples.example.json（內容是 s5、s4 的描述）
STYLE_EXAMPLES = BUILTIN_CONFIG / "style_examples.example.json"


def style_examples(n: int = 2) -> list[str]:
    """範例畫風描述，讓 Codex 寫出同樣格式：先用內建範例，不足 n 組再用畫風庫裡的"""
    ex = [b for e in read_json(STYLE_EXAMPLES, []) if (b := (e.get("style_block") or "").strip())]
    for lib in style_lib.list_all():
        if len(ex) >= n:
            break
        if (b := (lib.get("style_block") or "").strip()) and b not in ex:
            ex.append(b)
    return ex[:n]


def cells_for(ids: list[int], ears: bool = True) -> list[str]:
    """沒有獸耳的角色：有 prompt_no_ears 的表情改用那句（耳朵豎起、炸毛之類的描述會讓 Codex 長出耳朵）"""
    meta = sticker_map()
    return [
        (meta[i]["prompt"] if ears else meta[i].get("prompt_no_ears") or meta[i]["prompt"])
        for i in ids
        if i in meta
    ]


def preview_prompt(proj: Project) -> tuple[str, list[int], str, list[str]]:
    """回傳 (prompt, 預覽用的貼圖 id, 輸出路徑, 要附給 Codex 的圖)"""
    ids = prompts.template().get("preview_ids", [1, 3, 4, 9])
    out = f"outputs/{proj['id']}/grids/{proj['id']}_preview.png"
    ref_info = ref_paths(proj)
    text = prompts.build_prompt(
        style_block=proj["style_block"],
        framing=proj["framing"],
        cells=cells_for(ids, ref_info["ears"]),
        output=out,
        identity=ref_info["identity"],
        ears=ref_info["ears"],
        ref_line=prompts.ref_line(
            character=ref_info["character"], style=ref_info["style"], ears=ref_info["ears"]
        ),
    )
    return (
        text,
        ids,
        out,
        ref_info["style"] + ref_info["character"],
    )  # 畫風圖排前面（順序和 ref_line 的說明一致）


def group_prompt(
    proj: Project, index: int, ids: list[int], layout: str | None = None
) -> tuple[str, str, list[str]]:
    out = f"outputs/{proj['id']}/grids/{proj['id']}_group{index}.png"
    ref_info = ref_paths(proj)
    preview_img = proj["preview"]["image"]
    # 批次時有了核准樣張，畫風參考圖就不再附：樣張已經是「畫風＋這個角色」的答案，多給反而會拉偏
    text = prompts.build_prompt(
        style_block=proj["style_block"],
        framing=proj["framing"],
        cells=cells_for(ids, ref_info["ears"]),
        output=out,
        identity=ref_info["identity"],
        ears=ref_info["ears"],
        layout=layout,
        ref_line=prompts.ref_line(
            character=ref_info["character"], style=[], preview=preview_img, ears=ref_info["ears"]
        ),
    )
    return text, out, ref_info["character"] + [preview_img]

"""組 prompt：共用模板（config/prompt_template.json）＋畫風描述＋表情清單"""
import json
from .paths import CONFIG, read_json

# 每張網格的版型：依該組貼圖數量選擇
LAYOUTS = {
    "1x1": {"cols": 1, "rows": 1, "aspect": "square (1:1)", "cap": 1},
    "2x2": {"cols": 2, "rows": 2, "aspect": "square (1:1)", "cap": 4},
    "3x2": {"cols": 3, "rows": 2, "aspect": "landscape (3:2)", "cap": 6},
    "4x2": {"cols": 4, "rows": 2, "aspect": "landscape (3:2)", "cap": 8},   # 舊版：格子是 3:4 直式，只留給舊組別重生用
    # 預設：2:1 畫布（2048×1024）切 4×2，每格 512 正方形，一張 8 格（s9 實測內建 image_gen 會出 2:1）
    "4x2w": {"cols": 4, "rows": 2, "aspect": "wide 2:1 (exactly 2048x1024 pixels, twice as wide as it is tall)", "cap": 8},
}
# 批次版型 → 每組幾張。3x2：3:2 畫布切 3×2，每格是正方形，和 2×2 預覽的格子形狀一致
GROUP_LAYOUTS = {"3x2": 6, "4x2w": 8}
GROUP_SIZE = GROUP_LAYOUTS["3x2"]


def template() -> dict:
    return read_json(CONFIG / "prompt_template.json", {})


def layout_for(n: int) -> str:
    return layout_for_group(n)


def layout_for_group(n: int, big: str = "3x2") -> str:
    """big＝這次批次選的版型；張數少的組自動用小版型（剩 2 張就用 2×2）"""
    if n == 1:
        return "1x1"
    if n <= 4:
        return "2x2"
    if n <= 6:
        return "3x2"
    return "4x2w" if big == "4x2w" else "4x2"


def chunk(ids: list[int], size: int = GROUP_SIZE) -> list[list[int]]:
    return [ids[i:i + size] for i in range(0, len(ids), size)]


def sheet_line(n: int, layout: str, kind: str) -> str:
    L = LAYOUTS[layout]
    if layout == "1x1":
        return f"Create ONE {L['aspect']} image with a single {kind} emote, large and centered."
    s = (f"Create ONE {L['aspect']} image that is an emote sheet of {n} {kind} emotes "
         f"in a {L['cols']}-column x {L['rows']}-row grid.")
    if layout in ("2x2", "3x2", "4x2w"):
        s += " Every cell is a perfect square of equal size."
    s += " Draw the character's head at the SAME size and position in every cell, so the emotes match when used together."
    if n < L["cap"]:
        s += (f" Only the first {n} cells (left to right, top row first) contain an emote; "
              f"the remaining cells stay completely empty background.")
    return s


def build_prompt(*, style_block: str, framing: str, cells: list[str], output: str,
                 ref_line: str, identity: str = "", kind: str = "chibi-style",
                 ears: bool = True, layout: str | None = None) -> str:
    t = template()
    layout = layout or layout_for(len(cells))
    cell_text = "\n".join(f"{i}. {c}" for i, c in enumerate(cells, 1))
    parts = [
        f"$imagegen {ref_line}",
        sheet_line(len(cells), layout, kind),
        "Art style (this is the most important part):\n" + style_block.strip(),
        identity,
        _framing(t, framing, ears),
        t.get("layout_rules", ""),
        ("Cells, left to right, top row first:\n" if layout != "1x1" else "Expression:\n") + cell_text,
        f"Save the result as {output} (inside the current folder).",
    ]
    return "\n\n".join(p for p in parts if p)


def _framing(t: dict, framing: str, ears: bool) -> str:
    """沒有獸耳的角色改用不提耳朵的構圖說明，避免 Codex 自己補上耳朵"""
    table = t["framings"] if ears else {**t["framings"], **t.get("framings_no_ears", {})}
    return table.get(framing, table["closeup"])


def _list(paths: list[str]) -> str:
    return ", ".join(paths)


def ref_line(*, character: list[str], style: list[str], preview: str | None = None, ears: bool = True) -> str:
    """依附圖的角色組出「每張圖拿來做什麼」的說明。

    character：角色長相（角色庫的圖＋暫時上傳、標成角色的圖）
    style    ：畫風參考（只學畫法，不抄角色）
    preview  ：已核准的風格樣張（批次生成時才有）
    """
    lines = []
    # 有畫風參考圖時先講畫風圖：生圖模型很容易從精細的角色立繪「順便」學到畫法，蓋過畫風圖
    if style:
        lines.append(f"{_list(style)} {'is the' if len(style) == 1 else 'are the'} ART STYLE reference — this has the highest "
                     "priority for HOW to draw: copy its rendering exactly (line color and weight, amount of detail, "
                     "hair construction, eye construction, coloring and shading, head proportions), but do NOT copy its "
                     "character, pose, text or content.")
    if character:
        traits = "face, hair, ears, eyes, accessories, outfit" if ears else "face, hair, eyes, accessories, outfit"
        if style:
            lines.append(f"{_list(character)} show WHO to draw ({traits}) — use them only for identity: colors, hairstyle "
                         "silhouette and which accessories exist. IGNORE how they are rendered. When they disagree with the "
                         "art style reference, the art style reference wins: simplify the hair into the same few large "
                         "shapes and reduce accessories to the same low level of detail as the art style reference.")
        else:
            lines.append(f"{_list(character)} show the character's identity ({traits}) — "
                         "keep these traits, but do NOT copy their rendering style unless told below.")
    if preview:
        lines.append(f"{preview} is the approved style sample for this set — match its art style, proportions, lineart, "
                     "colors, shading, framing and cropping exactly.")
    elif not style:
        lines.append("Redraw the character in the new art style described below.")
    if not lines:
        return ""
    return "Use the attached reference images: " + " ".join(lines)


# ---------- 用 Codex 把需求擴寫成畫風描述 ----------

EXPAND_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "style_block", "framing", "square", "margin", "notes_zh"],
    "properties": {
        "name": {"type": "string", "description": "短的中文畫風名稱"},
        "style_block": {"type": "string", "description": "英文、以 '- ' 開頭的條列畫風描述，5~8 條"},
        "framing": {"type": "string", "enum": ["closeup", "whole"]},
        "square": {"type": ["number", "null"], "description": "closeup 用 0.5；whole 用 null"},
        "margin": {"type": "number", "description": "closeup 用 0；whole 用 0.04"},
        "notes_zh": {"type": "string", "description": "用繁體中文簡短說明這個畫風的重點與縮小後的辨識度風險"},
    },
}


def expand_request_prompt(request: str, examples: list[str], style_refs: list[str] | None = None) -> str:
    ex = "\n\n".join(f"Example style block:\n{e.strip()}" for e in examples if e.strip())
    if style_refs:
        refs = (f"\nThe user also attached art-style reference images ({_list(style_refs)}). Study how they are rendered and "
                "describe THAT rendering style (ignore who or what is drawn in them). The written request, if any, "
                "takes priority where they disagree.\n")
    else:
        refs = ""
    return f"""You are an art director writing prompts for an image model that draws Twitch/Discord emote sheets of ONE fixed character.
Do not run any tools and do not generate images. Only answer with the JSON object required by the output schema.

The user (writing in Chinese) wants this new art style:
\"\"\"{request.strip() or "(no text — follow the attached style references)"}\"\"\"
{refs}
Write `style_block`: 5-8 English bullet lines starting with "- " that describe ONLY the rendering style
(proportions, line art, coloring/shading, eyes/face treatment, how effects like tears or hearts are drawn).
Be concrete and visual. Do not describe the character's identity (it is added separately), the background, the grid,
or the framing. Prefer choices that stay readable at 28x28 pixels.
The image model already defaults to a generic detailed anime chibi look, so generic words ("cute", "pastel",
"clean lines") are not enough. Spend your bullets on what makes THIS style different from that default:
- The FIRST bullet must state the level of detail as countable facts, e.g. how many hair clumps/strands, whether
  individual strands are drawn, how much detail accessories and clothing get, how many shadow tones are used.
- Describe how the hair and the eyes are constructed (shapes, number of highlights, iris detail), and the line
  color and weight relative to the head size.
- Include one bullet starting with "- Avoid:" listing what the default anime look would add but this style does not
  (e.g. fine hair strands, hatching, small jewelry details, dark/black lines).

Choose `framing`: "closeup" (face fills the cell, cropped by the cell edges) for most anime/chibi styles,
or "whole" when the style is a compact whole-body/blob shape that must be fully visible (e.g. mochi, sticker figurine).
Set `square` = 0.5 and `margin` = 0 for closeup; `square` = null and `margin` = 0.04 for whole.

{ex}
"""


def write_schema(path) -> None:
    path.write_text(json.dumps(EXPAND_SCHEMA, ensure_ascii=False, indent=2), encoding="utf-8")

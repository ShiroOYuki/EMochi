"""組 prompt：共用模板（config/prompt_template.json）＋畫風描述＋表情清單"""
import json
from .paths import CONFIG, read_json

# 每張網格的版型：依該組貼圖數量選擇
LAYOUTS = {
    "1x1": {"cols": 1, "rows": 1, "aspect": "square (1:1)", "cap": 1},
    "2x2": {"cols": 2, "rows": 2, "aspect": "square (1:1)", "cap": 4},
    "4x2": {"cols": 4, "rows": 2, "aspect": "landscape (3:2)", "cap": 8},
}


def template() -> dict:
    return read_json(CONFIG / "prompt_template.json", {})


def layout_for(n: int) -> str:
    return "1x1" if n == 1 else "2x2" if n <= 4 else "4x2"


def chunk(ids: list[int], size: int = 8) -> list[list[int]]:
    return [ids[i:i + size] for i in range(0, len(ids), size)]


def sheet_line(n: int, layout: str, kind: str) -> str:
    L = LAYOUTS[layout]
    if layout == "1x1":
        return f"Create ONE {L['aspect']} image with a single {kind} emote, large and centered."
    s = (f"Create ONE {L['aspect']} image that is an emote sheet of {n} {kind} emotes "
         f"in a {L['cols']}-column x {L['rows']}-row grid.")
    if n < L["cap"]:
        s += (f" Only the first {n} cells (left to right, top row first) contain an emote; "
              f"the remaining cells stay completely empty background.")
    return s


def build_prompt(*, style_block: str, framing: str, cells: list[str], output: str,
                 ref_line: str, kind: str = "chibi-style") -> str:
    t = template()
    layout = layout_for(len(cells))
    cell_text = "\n".join(f"{i}. {c}" for i, c in enumerate(cells, 1))
    parts = [
        f"$imagegen {ref_line}",
        sheet_line(len(cells), layout, kind),
        "Art style (this is the most important part):\n" + style_block.strip(),
        t.get("identity", ""),
        t["framings"].get(framing, t["framings"]["closeup"]),
        t.get("layout_rules", ""),
        ("Cells, left to right, top row first:\n" if layout != "1x1" else "Expression:\n") + cell_text,
        f"Save the result as {output} (inside the current folder).",
    ]
    return "\n\n".join(p for p in parts if p)


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


def expand_request_prompt(request: str, examples: list[str]) -> str:
    ex = "\n\n".join(f"Example style block:\n{e.strip()}" for e in examples if e.strip())
    return f"""You are an art director writing prompts for an image model that draws Twitch/Discord emote sheets of ONE fixed character.
Do not run any tools and do not generate images. Only answer with the JSON object required by the output schema.

The user (writing in Chinese) wants this new art style:
\"\"\"{request.strip()}\"\"\"

Write `style_block`: 5-8 English bullet lines starting with "- " that describe ONLY the rendering style
(proportions, line art, coloring/shading, eyes/face treatment, how effects like tears or hearts are drawn).
Be concrete and visual. Do not describe the character's identity (it is added separately), the background, the grid,
or the framing. Prefer choices that stay readable at 28x28 pixels.

Choose `framing`: "closeup" (face fills the cell, cropped by the cell edges) for most anime/chibi styles,
or "whole" when the style is a compact whole-body/blob shape that must be fully visible (e.g. mochi, sticker figurine).
Set `square` = 0.5 and `margin` = 0 for closeup; `square` = null and `margin` = 0.04 for whole.

{ex}
"""


def write_schema(path) -> None:
    path.write_text(json.dumps(EXPAND_SCHEMA, ensure_ascii=False, indent=2), encoding="utf-8")

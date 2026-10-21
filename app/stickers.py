"""表情清單與分組

- 表情：config/stickers.json（list，本地資料；沒有時讀 stickers.example.json，第一次修改才寫出）。刪除是「軟刪除」：標 deleted=true，id 不會重用，
  圖庫裡已生成的成品還查得到名稱；Gen 頁面與新的批次生成看不到它。
- 分組：config/sticker_groups.json（list of {id, name, ids, default}，本地資料）。
  一個表情可以同時放在好幾個分組（分組是 Gen 頁面「一次勾一組」用的清單，不影響檔名或生成）。
  default=true 的分組，新專案的挑選步驟會預設勾起來。
  檔案還不存在時用 sticker_groups.example.json（預設 4 組），第一次儲存才寫檔。
"""

import json

from .errors import Conflict, Invalid, NotFound
from .paths import BUILTIN_CONFIG, _lock, config_dir, load_stickers, read_json, slugify, write_json

GROUPS_EXAMPLE = BUILTIN_CONFIG / "sticker_groups.example.json"  # 預設 4 組（進版控）


def groups_file():
    return config_dir() / "sticker_groups.json"


ALIGNS = (None, "bottom")
EDITABLE = ("label", "zh", "prompt", "prompt_no_ears", "align")


def _save_stickers(items: list[dict]) -> None:
    write_json(config_dir() / "stickers.json", items)


def active(items: list[dict] | None = None) -> list[dict]:
    return [s for s in (items if items is not None else load_stickers()) if not s.get("deleted")]


def _find(items: list[dict], sid: int) -> dict:
    for s in items:
        if s["id"] == sid:
            return s
    raise NotFound(f"表情 #{sid}")


def update(sid: int, changes: dict) -> dict:
    """改 label／zh／prompt／prompt_no_ears／align。name（檔名用）建立後不變，已生成的檔案才對得上"""
    with _lock:
        items = load_stickers()
        s = _find(items, sid)
        if s.get("deleted"):
            raise Conflict(f"表情 #{sid} 已刪除，請先還原")
        for k in EDITABLE:
            if k not in changes:
                continue
            v = changes[k]
            if k == "align":
                if v not in ALIGNS:
                    raise Invalid(f"不支援的對齊方式 {v}")
                if v:
                    s["align"] = v
                else:
                    s.pop("align", None)
                continue
            v = (v or "").strip()
            if k in ("label", "prompt") and not v:
                raise Invalid("名稱和英文描述都要填")
            if k == "prompt_no_ears" and not v:
                s.pop(k, None)
            else:
                s[k] = v
        _save_stickers(items)
        return s


def remove(sid: int) -> dict:
    """軟刪除，並從所有分組拿掉"""
    with _lock:
        items = load_stickers()
        s = _find(items, sid)
        s["deleted"] = True
        _save_stickers(items)
        groups = _load_groups(items)
        for g in groups:
            g["ids"] = [i for i in g["ids"] if i != sid]
        write_json(groups_file(), groups)
        return s


def restore(sid: int) -> dict:
    with _lock:
        items = load_stickers()
        s = _find(items, sid)
        s.pop("deleted", None)
        _save_stickers(items)
        return s


# ---------- 分組 ----------


def _load_groups(items: list[dict]) -> list[dict]:
    groups = read_json(groups_file())
    if groups is None:
        groups = read_json(GROUPS_EXAMPLE, []) or []
    alive = {s["id"] for s in active(items)}
    for g in groups:  # 手動改過 stickers.json 的話，濾掉不存在／已刪除的
        g["ids"] = [i for i in dict.fromkeys(g.get("ids", [])) if i in alive]
        g.setdefault("default", False)
    return groups


def load_groups() -> list[dict]:
    return _load_groups(load_stickers())


def save_groups(groups: list[dict]) -> list[dict]:
    """整份覆蓋（前端拖拉、改名、新增、刪除分組後送整份）。沒有 id（或 id ≤ 0）的分組會給新編號"""
    with _lock:
        items = load_stickers()
        alive = {s["id"] for s in active(items)}
        used = [g["id"] for g in groups if isinstance(g.get("id"), int)]
        nxt = max(used + [g["id"] for g in (read_json(groups_file()) or [])] + [0]) + 1
        seen, out = set(), []
        for g in groups:
            name = str(g.get("name") or "").strip()
            if not name:
                raise Invalid("分組名稱不能空白")
            gid = g.get("id")
            if not isinstance(gid, int) or gid <= 0 or gid in seen:  # 前端新增的分組 id 送 0
                gid, nxt = nxt, nxt + 1
            seen.add(gid)
            bad = [i for i in g.get("ids", []) if i not in alive]
            if bad:
                raise Invalid(f"找不到表情 #{bad[0]}")
            out.append(
                {
                    "id": gid,
                    "name": name,
                    "ids": list(dict.fromkeys(g.get("ids", []))),
                    "default": bool(g.get("default")),
                }
            )
        write_json(groups_file(), out)
        return out


def add(
    label: str,
    zh: str,
    prompt: str,
    align: str | None = None,
    prompt_no_ears: str = "",
    group_id: int | None = None,
) -> dict:
    """新增表情（id 取所有表情含已刪除的最大值 +1，不重用）；group_id 有給就順便放進那個分組"""
    if align not in ALIGNS:
        raise Invalid(f"不支援的對齊方式 {align}")
    with _lock:
        items = load_stickers()
        new_id = max((s["id"] for s in items), default=0) + 1
        names = {s["name"] for s in items}
        name = slugify(label)
        while name in names:
            name += "_2"
        item = {
            "id": new_id,
            "name": name,
            "label": label.strip(),
            "zh": zh.strip(),
            "prompt": prompt.strip(),
            "custom": True,
        }
        if prompt_no_ears.strip():
            item["prompt_no_ears"] = prompt_no_ears.strip()
        if align:
            item["align"] = align
        items.append(item)
        _save_stickers(items)
        if group_id is not None:
            groups = _load_groups(items)
            for g in groups:
                if g["id"] == group_id:
                    g["ids"].append(new_id)
            write_json(groups_file(), groups)
        return item


# ---------- 讓 Codex 擴寫表情 ----------

EXPAND_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["label", "zh", "prompt", "prompt_no_ears", "align"],
    "properties": {
        "label": {"type": "string"},
        "zh": {"type": "string"},
        "prompt": {"type": "string"},
        "prompt_no_ears": {"type": "string"},
        "align": {"type": "string", "enum": ["center", "bottom"]},
    },
}
EXAMPLES = 12  # 給 Codex 看的現有表情數量（風格參考）


def _examples(items: list[dict]) -> str:
    """挑幾個現有表情當範例：有 prompt_no_ears 的優先（示範什麼時候要填），其餘依編號"""
    act = active(items)
    pick = [s for s in act if s.get("prompt_no_ears")][:3]
    pick += [s for s in act if s not in pick][: EXAMPLES - len(pick)]
    rows = []
    for s in sorted(pick, key=lambda s: s["id"]):
        row = {"label": s["label"], "zh": s.get("zh", ""), "prompt": s["prompt"]}
        if s.get("prompt_no_ears"):
            row["prompt_no_ears"] = s["prompt_no_ears"]
        rows.append(json.dumps(row, ensure_ascii=False))
    return "\n".join(rows)


def expand_prompt(idea: str, current: dict | None = None) -> str:
    items = load_stickers()
    labels = ", ".join(s["label"] for s in active(items))
    cur = ""
    if current and any((current.get(k) or "").strip() for k in ("label", "zh", "prompt")):
        cur = "\nCurrent draft (improve it, keep what already fits):\n" + json.dumps(
            {k: current.get(k, "") for k in ("label", "zh", "prompt")}, ensure_ascii=False
        )
    return f"""You write ONE new chat-emote entry for a sticker sheet (Twitch / Discord emotes of one chibi character).
Do not run any tools and do not generate images. Answer only with the JSON required by the output schema.

The user's idea (may be Chinese or English): {idea}
{cur}
Existing entries, for style and length (match them closely):
{_examples(items)}

Rules:
- `prompt`: English, SHORT like the examples: 3-5 comma-separated phrases, about 8-18 words, max 22.
  Only the facial expression, gesture/pose and small emote effects (tears, sweat drops, hearts, sparkles…).
  No art style, no character appearance (hair, clothes), no background, no camera words, no full sentences.
  Must read clearly at 28x28 px: one strong, simple, exaggerated idea.
- `prompt_no_ears`: only if `prompt` mentions ears, fur or a tail: the same line rewritten without them (replace with face/eyebrow cues). Otherwise "".
- `label`: 1-2 English words, emote-name style (e.g. Hype, Puppy Eyes, Bruh). Avoid these existing labels: {labels}
- `zh`: 繁體中文，像範例一樣用頓號分隔的短句，10～16 字左右。
- `align`: "bottom" only when the character should be cut off by / pop up from the bottom edge (like peeking or lurking); otherwise "center"."""


def expand(idea: str, current: dict | None = None) -> dict:
    """同步等 Codex（實測約 10 秒）；只回傳建議，不存檔（前端填進表單讓使用者確認）"""
    from . import codex  # codex 會 import paths；放這裡避免 import 循環

    idea = (idea or "").strip() or " / ".join(
        (current or {}).get(k, "") for k in ("zh", "label") if (current or {}).get(k)
    )
    if not idea.strip():
        raise Invalid("先寫一句想要的表情")
    schema = codex.logs_dir() / "stickers" / "expand_schema.json"
    schema.parent.mkdir(parents=True, exist_ok=True)
    schema.write_text(json.dumps(EXPAND_SCHEMA), encoding="utf-8")
    data = json.loads(
        codex.run_text(expand_prompt(idea, current), schema, codex.log_path_for("stickers", "expand"))
    )
    return {
        "label": data["label"].strip(),
        "zh": data["zh"].strip(),
        "prompt": data["prompt"].strip(),
        "prompt_no_ears": (data.get("prompt_no_ears") or "").strip(),
        "align": "bottom" if data.get("align") == "bottom" else None,
    }

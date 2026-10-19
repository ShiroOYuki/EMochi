"""表情清單與分組

- 表情：config/stickers.json（list，本地資料；沒有時讀 stickers.example.json，第一次修改才寫出）。刪除是「軟刪除」：標 deleted=true，id 不會重用，
  圖庫裡已生成的成品還查得到名稱；Gen 頁面與新的批次生成看不到它。
- 分組：config/sticker_groups.json（list of {id, name, ids, default}，本地資料）。
  一個表情可以同時放在好幾個分組（分組是 Gen 頁面「一次勾一組」用的清單，不影響檔名或生成）。
  default=true 的分組，新專案的挑選步驟會預設勾起來。
  檔案還不存在時，從表情舊的 group 欄位（1～4 ＋ 0＝自訂）推出來，第一次儲存才寫檔。
"""
from .paths import CONFIG, _lock, load_stickers, read_json, slugify, write_json

GROUPS_FILE = CONFIG / "sticker_groups.json"
LEGACY_NAMES = {1: "基礎情緒", 2: "反應表情", 3: "社群互動", 4: "Twitch / 迷因", 0: "自訂"}
ALIGNS = (None, "bottom")
EDITABLE = ("label", "zh", "prompt", "prompt_no_ears", "align")


def _save_stickers(items: list[dict]) -> None:
    write_json(CONFIG / "stickers.json", items)


def active(items: list[dict] | None = None) -> list[dict]:
    return [s for s in (items if items is not None else load_stickers()) if not s.get("deleted")]


def _find(items: list[dict], sid: int) -> dict:
    for s in items:
        if s["id"] == sid:
            return s
    raise KeyError(f"找不到表情 #{sid}")


def update(sid: int, changes: dict) -> dict:
    """改 label／zh／prompt／prompt_no_ears／align。name（檔名用）建立後不變，已生成的檔案才對得上"""
    with _lock:
        items = load_stickers()
        s = _find(items, sid)
        if s.get("deleted"):
            raise ValueError(f"表情 #{sid} 已刪除，請先還原")
        for k in EDITABLE:
            if k not in changes:
                continue
            v = changes[k]
            if k == "align":
                if v not in ALIGNS:
                    raise ValueError(f"不支援的對齊方式 {v}")
                if v:
                    s["align"] = v
                else:
                    s.pop("align", None)
                continue
            v = (v or "").strip()
            if k in ("label", "prompt") and not v:
                raise ValueError("名稱和英文描述都要填")
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
        write_json(GROUPS_FILE, groups)
        return s


def restore(sid: int) -> dict:
    with _lock:
        items = load_stickers()
        s = _find(items, sid)
        s.pop("deleted", None)
        _save_stickers(items)
        return s


# ---------- 分組 ----------

def _legacy_groups(items: list[dict]) -> list[dict]:
    by: dict[int, list[int]] = {}
    for s in active(items):
        by.setdefault(s.get("group", 0) or 0, []).append(s["id"])
    out = []
    for n, g in enumerate(sorted(by, key=lambda g: g or 99), 1):
        out.append({"id": n, "name": LEGACY_NAMES.get(g, f"第 {g} 組"), "ids": by[g], "default": 1 <= g <= 4})
    return out


def _load_groups(items: list[dict]) -> list[dict]:
    groups = read_json(GROUPS_FILE)
    if groups is None:
        groups = _legacy_groups(items)
    alive = {s["id"] for s in active(items)}
    for g in groups:   # 手動改過 stickers.json 的話，濾掉不存在／已刪除的
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
        nxt = max(used + [g["id"] for g in (read_json(GROUPS_FILE) or [])] + [0]) + 1
        seen, out = set(), []
        for g in groups:
            name = str(g.get("name") or "").strip()
            if not name:
                raise ValueError("分組名稱不能空白")
            gid = g.get("id")
            if not isinstance(gid, int) or gid <= 0 or gid in seen:   # 前端新增的分組 id 送 0
                gid, nxt = nxt, nxt + 1
            seen.add(gid)
            bad = [i for i in g.get("ids", []) if i not in alive]
            if bad:
                raise ValueError(f"找不到表情 #{bad[0]}")
            out.append({"id": gid, "name": name, "ids": list(dict.fromkeys(g.get("ids", []))),
                        "default": bool(g.get("default"))})
        write_json(GROUPS_FILE, out)
        return out


def add(label: str, zh: str, prompt: str, align: str | None = None, prompt_no_ears: str = "",
        group_id: int | None = None) -> dict:
    """新增表情（id 取所有表情含已刪除的最大值 +1，不重用）；group_id 有給就順便放進那個分組"""
    if align not in ALIGNS:
        raise ValueError(f"不支援的對齊方式 {align}")
    with _lock:
        items = load_stickers()
        new_id = max((s["id"] for s in items), default=0) + 1
        names = {s["name"] for s in items}
        name = slugify(label)
        while name in names:
            name += "_2"
        item = {"id": new_id, "group": 0, "name": name, "label": label.strip(),
                "zh": zh.strip(), "prompt": prompt.strip(), "custom": True}
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
            write_json(GROUPS_FILE, groups)
        return item

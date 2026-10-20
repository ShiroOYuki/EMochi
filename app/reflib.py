"""角色庫、畫風庫共用的「一個資料夾一筆＋參考圖」儲存方式

<root>/<id>/<json_name>   這一筆的資料（images: [{file, use, source}]、next_index、created、updated…）
<root>/<id>/refs/         參考圖，一律用標準檔名 ref_01.png、ref_02.png…

流水號只增不減：移除 ref_02 之後新上傳的是 ref_03，不會沿用舊號，
這樣已經記錄「用了 ref_02」的畫風專案不會在不知情下換成另一張圖。
刪除整筆時移到垃圾桶（trash.py），還原前那個 id 不會被新的一筆拿走。
"""

import re
import threading
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from .images import move_to_removed, save_png
from .paths import read_json, write_json

PREFIX = "ref"
STD_RE = re.compile(rf"^{PREFIX}_(\d{{2,}})\.png$")


def std_name(n: int) -> str:
    return f"{PREFIX}_{n:02d}.png"


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class RefLibrary:
    def __init__(self, root: Callable[[], Path], json_name: str, trash_kind: str, id_prefix: str):
        self.root, self.json_name, self.trash_kind, self.id_prefix = root, json_name, trash_kind, id_prefix
        # 改動一筆資料（讀 → 改 → 存）時要拿著；下面的 add_images／remove_image／delete 會自己拿，
        # 其他（get、save、take_name、store）不拿，給呼叫端在已經拿著鎖時組合使用
        self.lock = threading.Lock()

    # ---------- 路徑、讀寫 ----------

    def json_path(self, item_id: str) -> Path:
        return self.root() / item_id / self.json_name

    def refs_dir(self, item_id: str) -> Path:
        return self.root() / item_id / "refs"

    def get(self, item_id: str) -> dict | None:
        """讀一筆；images 只留檔案還在的"""
        d = read_json(self.json_path(item_id))
        if d:
            d["images"] = [i for i in d.get("images", []) if (self.refs_dir(item_id) / i["file"]).exists()]
        return d

    def require(self, item_id: str) -> dict:
        d = self.get(item_id)
        if not d:
            raise KeyError(item_id)
        return d

    def list_all(self) -> list[dict]:
        root = self.root()
        if not root.exists():
            return []
        out = [d for f in sorted(root.glob(f"*/{self.json_name}")) if (d := self.get(f.parent.name))]
        return sorted(out, key=lambda d: d.get("created", ""))

    def save(self, d: dict) -> dict:
        d["updated"] = now()
        write_json(self.json_path(d["id"]), d)
        return d

    def new_id(self) -> str:
        """下一個沒被用過的 id（資料夾裡、垃圾桶裡的都算用過）"""
        from .trash import reserved_ids

        used = reserved_ids(self.trash_kind)
        n = 1
        while (self.root() / f"{self.id_prefix}{n}").exists() or f"{self.id_prefix}{n}" in used:
            n += 1
        return f"{self.id_prefix}{n}"

    # ---------- 參考圖 ----------

    def take_name(self, d: dict) -> str:
        """發下一個標準檔名（並推進流水號）"""
        folder = self.refs_dir(d["id"])
        used = [int(m.group(1)) for i in d["images"] if (m := STD_RE.match(i["file"]))]
        n = max([d.get("next_index", 1), *(u + 1 for u in used)])
        while (folder / std_name(n)).exists():
            n += 1
        d["next_index"] = n + 1
        return std_name(n)

    def store(self, d: dict, files: list[tuple[str, bytes]], use: bool = True) -> None:
        """把上傳的圖存成標準檔名、記進 images（source＝原檔名）"""
        for fname, raw in files:
            d["images"].append(
                {
                    "file": save_png(raw, self.refs_dir(d["id"]), fname, exact=self.take_name(d)),
                    "use": use,
                    "source": fname,
                }
            )

    @staticmethod
    def apply_use(d: dict, use: dict) -> None:
        """{file: bool}：哪幾張預設附上"""
        for i in d["images"]:
            if i["file"] in use:
                i["use"] = bool(use[i["file"]])

    def add_images(self, item_id: str, files: list[tuple[str, bytes]]) -> dict:
        with self.lock:
            d = self.require(item_id)
            self.store(d, files)
            return self.save(d)

    def remove_image(self, item_id: str, file: str) -> dict:
        """圖檔移到 refs/_removed/（不直接刪）"""
        with self.lock:
            d = self.require(item_id)
            move_to_removed(self.refs_dir(item_id) / Path(file).name)
            d["images"] = [i for i in d["images"] if i["file"] != file]
            return self.save(d)

    def delete(self, item_id: str) -> None:
        """整筆移到垃圾桶 <root>/_removed/（見 trash.py）"""
        from .trash import move_to_trash

        with self.lock:
            move_to_trash(self.trash_kind, item_id)

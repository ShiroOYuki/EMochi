"""內建範例畫風：全新安裝才放進畫風庫；已經有畫風庫（或使用者刪掉了）就不動"""
import shutil
import tempfile
from pathlib import Path


def test_seed_only_on_fresh_install(monkeypatch):
    from app import settings, style_lib
    ext = Path(tempfile.mkdtemp(prefix="emochi_lib_")) / "style_lib"
    monkeypatch.setattr(style_lib, "style_lib_dir", lambda: ext)
    assert style_lib.seed_defaults() == ["st1"]
    s = style_lib.get("st1")
    assert s["name"] == "暖柔奶油萌繪" and s["style_block"].startswith("- ") and s["images"][0]["use"]
    assert (ext / "st1" / "refs" / "ref_01.png").is_file()
    # 使用者刪掉後重新啟動：資料夾還在 → 不會再長回來
    shutil.rmtree(ext / "st1")
    assert style_lib.seed_defaults() == [] and style_lib.list_all() == []
    assert settings  # 只為了 import 順序（settings 會被 style_lib_dir 用到）


def test_builtin_example_is_valid():
    import json
    from app.style_lib import BUILTIN_STYLES
    d = json.loads((BUILTIN_STYLES / "st1" / "style.json").read_text(encoding="utf-8"))
    assert d["id"] == "st1" and d["framing"] in ("closeup", "whole")
    assert all((BUILTIN_STYLES / "st1" / "refs" / i["file"]).is_file() for i in d["images"])

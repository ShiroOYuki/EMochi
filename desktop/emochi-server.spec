# PyInstaller：把 FastAPI 後端打包成 dist/emochi-server/emochi-server.exe（onedir，啟動比 onefile 快）
# 在專案根目錄執行：uv run --group desktop pyinstaller desktop/emochi-server.spec --noconfirm
# 前端要先 build（app/static）。內建設定、前端檔案放進 _internal，程式用 paths.APP_ROOT 找
from pathlib import Path

ROOT = Path(SPECPATH).parent
CONFIG = [(str(p), "config") for p in (ROOT / "config").glob("*.json")
          if p.name == "prompt_template.json" or p.name.endswith(".example.json")]

a = Analysis(
    [str(ROOT / "desktop" / "server_entry.py")],
    pathex=[str(ROOT)],
    datas=[(str(ROOT / "app" / "static"), "app/static"), *CONFIG,
           (str(ROOT / "config" / "style_lib.example"), "config/style_lib.example"),   # 內建範例畫風（含圖）
           (str(ROOT / "config" / "sticker_examples.example"), "config/sticker_examples.example")],   # 內建表情 #1～32 的預設範例圖
    hiddenimports=["scipy.ndimage"],
    excludes=["tkinter", "_tkinter", "rembg", "onnxruntime", "matplotlib", "pytest", "IPython"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="emochi-server", console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, name="emochi-server", upx=False)

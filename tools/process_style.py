#!/usr/bin/env python3
"""
把 outputs/<style>/grids/<style>_group1~4.png 處理成成品：
  outputs/<style>/final/{master, twitch/112, twitch/56, twitch/28, discord}
  outputs/<style>/previews/{<style>_preview.png, <style>_all32_discord.png}
用法：
  uv run tools/process_style.py s5                 # 參數預設讀 config/styles.json 的 process
  uv run tools/process_style.py s4 --margin 0.06   # 命令列參數會覆蓋設定檔
  uv run tools/process_style.py s5 --no-square     # 強制不做正方形裁切
Lurk(#28) 會自動改成貼齊底邊。
"""
import argparse, glob, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
from postprocess import checker  # noqa: E402


def run(args):
    env = {**os.environ, "PYTHONUTF8": "1"}  # 子程序也用 UTF-8，避免 cp950 印不出 ✓
    subprocess.run([sys.executable, str(TOOLS / "postprocess.py"), *args], check=True,
                   stdout=subprocess.DEVNULL, env=env)


def load_process_cfg(style):
    """config/styles.json 裡該畫風的 process 區塊；找不到就回傳空 dict（使用內建預設）"""
    try:
        cfg = json.loads((ROOT / "config" / "styles.json").read_text(encoding="utf-8"))
        return cfg["styles"][style].get("process", {})
    except (OSError, KeyError, ValueError):
        return {}


def _utf8_console():
    """Windows cmd 預設 cp950，避免中文訊息變亂碼或 UnicodeEncodeError"""
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("style")
    ap.add_argument("--square", type=float, default=None)
    ap.add_argument("--no-square", action="store_true")
    ap.add_argument("--margin", type=float, default=None)
    ap.add_argument("--min-blob", type=float, default=0.0003)
    a = ap.parse_args()
    S = a.style
    cfg = load_process_cfg(S)
    if a.square is None and not a.no_square:
        a.square = cfg.get("square", 0.5)
        a.no_square = a.square is None
    if a.margin is None:
        a.margin = cfg.get("margin", 0)
    G = ROOT / "outputs" / S / "grids"
    grids = [G / f"{S}_group{i}.png" for i in range(1, 5)]
    for g in grids:
        if not g.exists():
            sys.exit(f"找不到 {g}")
    common = ["--min-blob", str(a.min_blob)]
    if not a.no_square:
        common += ["--square", str(a.square)]
    tmp = Path(tempfile.mkdtemp())
    run([*map(str, grids), "--margin", str(a.margin), *common, "--out", str(tmp / "all")])
    run([str(grids[3]), "--start", "25", "--margin", "0", "--align", "bottom", *common, "--out", str(tmp / "lurk")])
    for d in ("master", "112x112", "56x56", "28x28"):
        shutil.copy(tmp / "lurk" / d / "28_lurk.png", tmp / "all" / d / "28_lurk.png")

    F = ROOT / "outputs" / S / "final"
    P = ROOT / "outputs" / S / "previews"
    dest = {"master": F / "master", "112x112": F / "twitch/112", "56x56": F / "twitch/56", "28x28": F / "twitch/28"}
    for src, dst in dest.items():
        dst.mkdir(parents=True, exist_ok=True)
        for f in (tmp / "all" / src).glob("*.png"):
            shutil.copy(f, dst / f.name)          # 覆蓋，不需要刪除權限
    (F / "discord").mkdir(parents=True, exist_ok=True)
    P.mkdir(parents=True, exist_ok=True)
    masters = sorted((F / "master").glob("*.png"))
    for f in masters:
        Image.open(f).convert("RGBA").resize((128, 128), Image.LANCZOS).save(
            F / "discord" / f.name.split("_", 1)[1], optimize=True)
    tile = 160
    sheet = checker(8 * tile, 4 * tile)
    for i, f in enumerate(masters):
        sheet.alpha_composite(Image.open(f).resize((tile, tile), Image.LANCZOS), ((i % 8) * tile, (i // 8) * tile))
    sheet.convert("RGB").save(P / f"{S}_preview.png")
    im = Image.new("RGB", (8 * 122 + 20 + 8 * 64 + 20 + 8 * 36 + 30, 4 * 125 + 20), (49, 51, 56))
    for i, f in enumerate(sorted((F / "twitch/112").glob("*.png"))):
        r, c = divmod(i, 8)
        y = 10 + r * 125
        for sz, x0, step in [(112, 10, 122), (56, 10 + 8 * 122 + 20, 64), (28, 10 + 8 * 122 + 20 + 8 * 64 + 20, 36)]:
            t = Image.open(F / f"twitch/{sz}" / f.name)
            im.paste(t, (x0 + c * step, y + (112 - sz) // 2), t)
    im.save(P / f"{S}_all32_discord.png")
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"{S}: {len(masters)} 張完成 → {F}")


if __name__ == "__main__":
    _utf8_console()
    main()

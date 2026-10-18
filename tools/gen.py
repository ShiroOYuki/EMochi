#!/usr/bin/env python3
"""
用 Codex CLI 的 $imagegen 生成貼圖網格（取代舊的 run_*.bat）

用法：
  uv run tools/gen.py s5                  # 先跑第 1 組，成功後第 2~4 組並行
  uv run tools/gen.py s5 -g 2 4           # 只跑指定組（並行）
  uv run tools/gen.py s1 -g single_28     # 跑 prompts/s1/single_28.txt → outputs/s1/grids/s1_single_28.png
  uv run tools/gen.py s5 --dry-run        # 只印出要執行的指令

規則：
  prompt   prompts/<style>/g<N>.txt（或 <名稱>.txt），內容中的 {output} 會換成輸出路徑
  輸出     outputs/<style>/grids/<style>_group<N>.png（或 <style>_<名稱>.png）
  參考圖   config/styles.json：refs 每組都附；group1_refs 只附給第 1 組；
           其他組自動附上本畫風的 group1 成品，確保跨組畫風一致
  紀錄     logs/<style>_<組>.log；已存在的舊圖會先備份到 grids/_prev/
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "styles.json"


def load_config():
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def job_for(style, token, scfg):
    """把組別代號（'1'~'4' 或 prompt 名稱）轉成 prompt / 輸出 / 參考圖"""
    if token.isdigit():
        prompt = ROOT / "prompts" / style / f"g{token}.txt"
        out = Path("outputs", style, "grids", f"{style}_group{token}.png")
    else:
        prompt = ROOT / "prompts" / style / f"{token}.txt"
        out = Path("outputs", style, "grids", f"{style}_{token}.png")
    refs = list(scfg.get("refs", []))
    if token == "1":
        refs += scfg.get("group1_refs", [])
    else:
        refs.append(Path("outputs", style, "grids", f"{style}_group1.png").as_posix())
    return {"token": token, "prompt": prompt, "out": out, "refs": refs,
            "log": ROOT / "logs" / f"{style}_{token if not token.isdigit() else 'g' + token}.log"}


def check_inputs(job):
    missing = [r for r in job["refs"] if not (ROOT / r).exists()]
    if not job["prompt"].exists():
        missing.insert(0, job["prompt"].relative_to(ROOT).as_posix())
    return missing


def backup_existing(job):
    src = ROOT / job["out"]
    if src.exists():
        prev = src.parent / "_prev"
        prev.mkdir(exist_ok=True)
        dst = prev / f"{src.stem}_{datetime.fromtimestamp(src.stat().st_mtime):%Y%m%d_%H%M%S}{src.suffix}"
        shutil.copy2(src, dst)
        return dst


KEY_COLORS = {"#00FF00": (0, 255, 0), "#FF00FF": (255, 0, 255)}  # postprocess.py --key auto 支援的背景色


def check_result(out_path: Path, started_at: float, grid: bool = True) -> tuple[bool, str]:
    """判斷 Codex 這次是否真的產出了可用的圖，回傳 (是否可用, 原因)。

    1. 檔案存在，且是這次執行後才寫入的（避免把舊圖當成功）
    2. 網格圖必須是橫式、接近 3:2（4×2 格）；單張圖接近 1:1
    3. 四個角落是純色去背底色（#00FF00 或 #FF00FF），否則去背會失敗
    """
    if not out_path.exists():
        return False, "沒有產生檔案"
    if out_path.stat().st_mtime < started_at - 1:
        return False, "檔案沒有更新（仍是舊圖）"
    try:
        from PIL import Image
        im = Image.open(out_path).convert("RGB")
    except Exception as e:  # 檔案寫一半或格式錯誤
        return False, f"無法開啟圖片：{e}"

    w, h = im.size
    ratio = w / h
    lo, hi = (1.3, 1.8) if grid else (0.85, 1.18)
    if not lo <= ratio <= hi:
        return False, f"比例 {w}x{h}（{ratio:.2f}）不符，預期 {'3:2 橫式' if grid else '1:1'}"

    # 每個角落取一小塊平均色，跟去背色比距離
    pad, box = int(min(w, h) * 0.01), max(4, int(min(w, h) * 0.03))
    corners = [(pad, pad), (w - pad - box, pad), (pad, h - pad - box), (w - pad - box, h - pad - box)]
    means = [tuple(sum(c) / len(c) for c in zip(*im.crop((x, y, x + box, y + box)).getdata()))
             for x, y in corners]
    for name, key in KEY_COLORS.items():
        if all(sum((a - b) ** 2 for a, b in zip(m, key)) ** 0.5 < 60 for m in means):
            return True, f"OK（{w}x{h}，背景 {name}）"
    return False, "四角不是純綠 / 洋紅背景，去背可能失敗"


def start(job, codex, cfg, dry):
    cmd = [codex, *cfg["codex"]["args"]]
    for r in job["refs"]:
        cmd += ["-i", str(Path(r))]
    cmd.append("-")
    text = job["prompt"].read_text(encoding="utf-8").replace("{output}", job["out"].as_posix())
    print(f"[{job['token']}] {' '.join(cmd[1:])}  < {job['prompt'].relative_to(ROOT).as_posix()}")
    if dry:
        return None
    bak = backup_existing(job)
    if bak:
        print(f"[{job['token']}] 舊圖已備份 → {bak.relative_to(ROOT).as_posix()}")
    (ROOT / job["out"]).parent.mkdir(parents=True, exist_ok=True)
    job["log"].parent.mkdir(exist_ok=True)
    log = open(job["log"], "w", encoding="utf-8")
    log.write(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] start\n{' '.join(cmd)}\n\n")
    log.flush()
    proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT)
    proc.stdin.write(text.encode("utf-8"))
    proc.stdin.close()
    job.update(proc=proc, logf=log, started=time.time())
    return proc


def finish(job):
    code = job["proc"].wait()
    job["logf"].write(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}] exit {code}\n")
    job["logf"].close()
    ok, why = check_result(ROOT / job["out"], job["started"], grid=job["token"].isdigit())
    if code != 0:
        ok, why = False, f"codex 結束碼 {code}"
    mins = (time.time() - job["started"]) / 60
    target = job["out"].as_posix() if ok else f"看紀錄 {job['log'].relative_to(ROOT).as_posix()}"
    print(f"[{job['token']}] {'完成' if ok else '失敗'}（{mins:.1f} 分）{why} → {target}")
    return ok


def _utf8_console():
    """Windows cmd 預設 cp950，避免中文訊息變亂碼或 UnicodeEncodeError"""
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass


def main():
    ap = argparse.ArgumentParser(description="用 Codex $imagegen 生成貼圖網格")
    ap.add_argument("style", help="畫風代號，對應 config/styles.json 與 prompts/<style>/")
    ap.add_argument("-g", "--groups", nargs="+", help="要跑的組別（1~4 或 prompt 名稱），預設 1 2 3 4")
    ap.add_argument("--dry-run", action="store_true", help="只印出指令不執行")
    a = ap.parse_args()

    cfg = load_config()
    if a.style not in cfg["styles"]:
        sys.exit(f"config/styles.json 沒有畫風 {a.style}，可用：{', '.join(cfg['styles'])}")
    scfg = cfg["styles"][a.style]
    groups = a.groups or ["1", "2", "3", "4"]
    jobs = [job_for(a.style, g, scfg) for g in groups]

    codex = shutil.which("codex")
    if not codex and not a.dry_run:
        sys.exit("找不到 codex 指令，請確認 Codex CLI 已安裝並在 PATH 中")
    codex = codex or "codex"

    # 第 1 組要先完成，其他組才有 group1 可以當參考圖
    first = [j for j in jobs if j["token"] == "1"]
    rest = [j for j in jobs if j["token"] != "1"]
    for batch in (first, rest):
        if not batch:
            continue
        for j in batch:
            if missing := ([] if a.dry_run and j in rest and first else check_inputs(j)):
                sys.exit(f"[{j['token']}] 缺少檔案：{', '.join(missing)}")
        for j in batch:
            start(j, codex, cfg, a.dry_run)
        if a.dry_run:
            continue
        results = [finish(j) for j in batch]
        if batch is first and not all(results):
            sys.exit("第 1 組失敗，停止（不跑後面幾組）。")
    if not a.dry_run:
        print(f"\n全部結束。下一步：uv run tools/process_style.py {a.style}")


if __name__ == "__main__":
    _utf8_console()
    main()

"""generation_finished（提前結束 Codex 的判斷）與用量窗口過期"""

import os
import time

from conftest import make_grid

from app import codex, usage

DONE_LOG = "...\nimage saved\ntokens used\n12,345\n"


def test_not_finished_without_turn_end_marker(data_root):
    p = make_grid(data_root / "tmp" / "gf1.png")
    start = time.time() - 5
    st = {}
    assert not codex.generation_finished(p, start, "working...\n", st, "3x2", now=start + 100)
    assert "done_at" not in st


def test_finished_after_stable_file_and_grace(data_root):
    p = make_grid(data_root / "tmp" / "gf2.png")
    start = time.time() - 5
    st = {}
    t0 = time.time()
    # 第一次看到：記下檔案簽名，還不算（要連續兩次一樣）
    assert not codex.generation_finished(p, start, DONE_LOG, st, "3x2", now=t0)
    # 簽名一樣但寬限期還沒過
    assert not codex.generation_finished(p, start, DONE_LOG, st, "3x2", now=t0 + 3)
    # 過了寬限期 → 驗圖通過 → True
    assert codex.generation_finished(p, start, DONE_LOG, st, "3x2", now=t0 + codex.FINISH_GRACE_SEC + 1)


def test_file_still_changing_is_not_finished(data_root):
    p = make_grid(data_root / "tmp" / "gf3.png")
    start = time.time() - 5
    st = {}
    t0 = time.time()
    codex.generation_finished(p, start, DONE_LOG, st, "3x2", now=t0)
    make_grid(p, empty={0})  # 檔案又被改寫
    os.utime(p, (t0 + 1, t0 + 1))
    assert not codex.generation_finished(p, start, DONE_LOG, st, "3x2", now=t0 + 60)


def test_old_or_wrong_image_is_not_finished(data_root):
    p = make_grid(data_root / "tmp" / "gf4.png")
    old = time.time() - 3600
    os.utime(p, (old, old))
    st = {}
    t0 = time.time()
    for dt in (0, 1, 100):  # 舊圖：永遠不算完成
        assert not codex.generation_finished(p, time.time() - 5, DONE_LOG, st, "3x2", now=t0 + dt)

    q = make_grid(data_root / "tmp" / "gf5.png", cols=1, rows=1)  # 比例不對（1:1 當 3×2）
    st2 = {}
    for dt in (0, 1, 100):
        assert not codex.generation_finished(q, time.time() - 5, DONE_LOG, st2, "3x2", now=t0 + dt)


def test_usage_window_expiry():
    data = {
        "primary": {"used_percent": 20.0, "resets_at": 1000.0},
        "secondary": {"used_percent": 9.0, "resets_at": 5000.0},
        "plan_type": "plus",
    }
    out = usage._expire(data, now=2000.0)
    assert out["primary"]["used_percent"] == 0.0 and out["primary"]["expired"]
    assert out["secondary"]["used_percent"] == 9.0 and "expired" not in out["secondary"]
    assert out["now"] == 2000.0
    assert data["primary"]["used_percent"] == 20.0  # 原資料不被改到（快取共用）

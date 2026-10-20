"""失敗的圖：重新檢查（只檢查、不生成）與手動通過"""

import shutil

import pytest
from conftest import make_grid
from PIL import Image

IDS = ["s901", "s902", "s903", "s904"]


@pytest.fixture(autouse=True)
def _cleanup(data_root):
    """測試專案用完就刪：留著的話（例如重生後停在 generating）其他測試會以為有專案在執行"""
    yield
    for sid in IDS:
        shutil.rmtree(data_root / "outputs" / sid, ignore_errors=True)


def _project(data_root, sid, image_ok: bool):
    from app import jobs

    img = data_root / "outputs" / sid / "grids" / f"{sid}_group1.png"
    if image_ok:
        make_grid(img, cols=3, rows=2)
    else:
        img.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (1536, 1024), (255, 255, 255)).save(img)  # 白底：背景檢查一定失敗
    p = {
        "id": sid,
        "name": "",
        "request": "",
        "style_block": "x",
        "framing": "closeup",
        "process": {"square": 0.5, "margin": 0, "min_blob": 0.0003},
        "notes_zh": "",
        "status": "review",
        "error": None,
        "created": "",
        "updated": "",
        "preview": None,
        "sticker_ids": [1, 2, 3, 4, 5, 6],
        "groups": [
            {
                "index": 1,
                "ids": [1, 2, 3, 4, 5, 6],
                "layout": "3x2",
                "prompt": "",
                "image": f"outputs/{sid}/grids/{sid}_group1.png",
                "status": "failed",
                "message": "舊的失敗訊息",
                "attempts": 1,
            }
        ],
    }
    jobs.save(p)
    return p


def test_recheck_still_failing_records_time(data_root):
    from app import jobs

    _project(data_root, "s901", image_ok=False)
    g = jobs.recheck("s901", "1")["groups"][0]
    assert g["status"] == "failed" and g["rechecked"] and "背景" in g["message"]


def test_recheck_passes(data_root):
    from app import jobs

    _project(data_root, "s902", image_ok=True)
    g = jobs.recheck("s902", "1")["groups"][0]
    assert g["status"] == "done" and g["message"].startswith("OK")


def test_accept_and_regenerate_clears(data_root, client, monkeypatch):
    from app import jobs

    _project(data_root, "s903", image_ok=False)
    r = client.post("/api/projects/s903/accept/1").json()
    g = r["groups"][0]
    assert g["status"] == "done" and g["accepted"] is True and g["message"].startswith("手動通過")
    assert client.post("/api/projects/s903/accept/1").status_code == 409  # 已經不是失敗
    monkeypatch.setattr(jobs._pool, "submit", lambda *a, **k: None)  # 不真的跑 Codex
    g = jobs.regenerate_group("s903", 1)["groups"][0]
    assert "accepted" not in g and g["status"] == "pending"


def test_accept_needs_image(data_root):
    from app import jobs

    p = _project(data_root, "s904", image_ok=False)
    (data_root / p["groups"][0]["image"]).unlink()
    with pytest.raises(ValueError):
        jobs.accept("s904", "1")

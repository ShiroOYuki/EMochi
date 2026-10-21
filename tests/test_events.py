"""桌面通知用的事件：預覽圖、整批生成跑完各發一次；/api/events 只給新的"""

import shutil

import pytest
from fastapi.testclient import TestClient

SID = "s951"


@pytest.fixture(autouse=True)
def _clean(data_root):
    from app import events

    events.reset()
    yield
    shutil.rmtree(data_root / "outputs" / SID, ignore_errors=True)


def _project(groups: int, status="generating"):
    from app import jobs

    p = {
        "id": SID,
        "name": "測試畫風",
        "request": "",
        "style_block": "x",
        "framing": "closeup",
        "process": {"square": 0.5, "margin": 0, "min_blob": 0.0003},
        "notes_zh": "",
        "status": status,
        "error": None,
        "created": "",
        "updated": "",
        "sticker_ids": [1],
        "preview": {
            "image": f"outputs/{SID}/grids/{SID}_preview.png",
            "ids": [1],
            "prompt": "",
            "layout": "2x2",
            "status": "running",
            "message": "",
        },
        "groups": [
            {
                "index": i,
                "ids": [i],
                "layout": "3x2",
                "prompt": "",
                "image": f"outputs/{SID}/grids/{SID}_group{i}.png",
                "status": "running",
                "message": "",
                "attempts": 1,
            }
            for i in range(1, groups + 1)
        ],
    }
    jobs.save(p)


def _fake_codex(monkeypatch, results: dict):
    from app import codex

    monkeypatch.setattr(codex, "run_image", lambda prompt, refs, image, layout, log: results[image])


def test_batch_emits_once_when_all_groups_finish(monkeypatch):
    from app import events, jobs

    _project(3)
    _fake_codex(
        monkeypatch,
        {
            f"outputs/{SID}/grids/{SID}_group{i}.png": (i != 2, "背景不是純綠" if i == 2 else "ok")
            for i in (1, 2, 3)
        },
    )
    jobs._run_group(SID, 1)
    jobs._run_group(SID, 2)
    assert events.since(0, events.BOOT)["events"] == []  # 還有一組在跑
    jobs._run_group(SID, 3)
    evs = events.since(0, events.BOOT)["events"]
    assert len(evs) == 1
    e = evs[0]
    assert (e["kind"], e["project"], e["ok"]) == ("batch", SID, False)
    assert "2 組成功" in e["body"] and "第 2 組失敗" in e["body"] and "測試畫風" in e["body"]


def test_regenerate_single_group_emits_again(monkeypatch):
    from app import events, jobs

    _project(1, status="generating")
    _fake_codex(monkeypatch, {f"outputs/{SID}/grids/{SID}_group1.png": (True, "ok")})
    jobs._run_group(SID, 1)
    assert events.since(0, events.BOOT)["events"][0]["title"] == "生成完成"


def test_preview_emits(monkeypatch):
    from app import events, jobs

    _project(0, status="previewing")
    _fake_codex(monkeypatch, {f"outputs/{SID}/grids/{SID}_preview.png": (False, "逾時")})
    jobs._run_preview(SID)
    e = events.since(0, events.BOOT)["events"][0]
    assert (e["kind"], e["title"], e["ok"]) == ("preview", "預覽圖失敗", False)
    assert "逾時" in e["body"]


def test_api_first_call_and_reboot_skip_old_events():
    from app import events
    from app.server import app

    c = TestClient(app, base_url="http://127.0.0.1")
    events.emit("batch", SID, "舊的")
    first = c.get("/api/events").json()
    assert first["events"] == [] and first["seq"] == 1  # 第一次只同步 seq
    events.emit("batch", SID, "新的")
    r = c.get("/api/events", params={"after": first["seq"], "boot": first["boot"]}).json()
    assert [e["title"] for e in r["events"]] == ["新的"]
    stale = c.get("/api/events", params={"after": 0, "boot": "other"}).json()
    assert stale["events"] == [] and stale["seq"] == 2  # 伺服器重開過：不補發


def test_notify_pref():
    from app.server import app

    c = TestClient(app, base_url="http://127.0.0.1")
    assert c.get("/api/ui-prefs").json()["notify"] is True
    assert c.put("/api/ui-prefs", json={"notify": False}).json()["notify"] is False
    assert c.put("/api/ui-prefs", json={"notify": True}).json()["notify"] is True

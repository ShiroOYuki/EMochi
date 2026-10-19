"""Codex 狀態：從 logs/ 統計近 7 天 token、分類、結果判斷（不呼叫真的 Codex）"""
from datetime import datetime


def _log(root, scope, name, ts, tokens=None, end="exit exit=0", secs=30):
    d = root / "logs" / scope
    d.mkdir(parents=True, exist_ok=True)
    t = datetime.strptime(ts, "%Y%m%d_%H%M%S")
    body = f"[{t:%Y-%m-%d %H:%M:%S}] start\ncodex exec -\n\n"
    if tokens is not None:
        body += f"tokens used\n{tokens:,}\n"
    if end:
        e = t.replace(second=0).timestamp() + secs
        body += f"\n[{datetime.fromtimestamp(e):%Y-%m-%d %H:%M:%S}] {end}\n"
    p = d / f"{name}_{ts}.log"
    p.write_text(body, encoding="utf-8")
    return p


def test_usage_days(data_root):
    from app import codex_status as cs
    _log(data_root, "s90", "g1", "20261019_100000", 50000)
    _log(data_root, "s90", "g2", "20261019_100000", 40000, end="timeout exit=1")
    _log(data_root, "s90", "preview", "20261018_090000", 20000)
    _log(data_root, "stickers", "expand", "20261017_090000", 9000)
    _log(data_root, "characters", "c1_describe", "20261010_090000", 7777)   # 超過 7 天
    _log(data_root, "legacy", "g1", "20261019_100000", 99999)              # 舊格式資料夾不算
    _log(data_root, "s90", "g3", "20261019_110000", None, end=None)         # 被中斷
    u = cs.usage_days(now=datetime(2026, 10, 19, 12, 0))
    assert [d["date"] for d in u["daily"]][0] == "2026-10-13" and len(u["daily"]) == 7
    day = {d["date"]: d for d in u["daily"]}
    assert day["2026-10-19"]["tokens"] == 90000 and day["2026-10-19"]["runs"] == 3
    assert day["2026-10-19"]["by_kind"] == {"批次生圖": 90000}
    assert day["2026-10-17"]["by_kind"] == {"表情擴寫": 9000}
    assert u["total_tokens"] == 119000 and u["runs"] == 5 and u["failed"] == 1
    assert u["avg_grid_tokens"] == round((50000 + 40000 + 20000) / 3)
    res = {r["name"]: r["result"] for r in u["recent"]}
    assert res == {"g1": "ok", "g2": "timeout", "g3": "unknown", "preview": "ok", "expand": "ok"}
    assert {x["key"]: x["label"] for x in u["by_scope"]}["stickers"] == "表情"
    assert u["recent"][0]["name"] == "g3"


def test_status_endpoint(client, monkeypatch):
    from app import codex_status as cs
    monkeypatch.setattr(cs, "check", lambda force=False: {"cli": {"found": False}, "login": {"ok": False, "text": "x", "pending": False}})
    d = client.get("/api/codex-status").json()
    assert {"cli", "login", "rate", "running", "usage", "sessions_dir"} <= d.keys()
    assert len(d["usage"]["daily"]) == 7

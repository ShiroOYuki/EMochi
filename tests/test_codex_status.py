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
    _log(data_root, "s90", "single", "20261019_080000", 1000, secs=-60)     # 從舊版轉換、不知道開始時間（結束 ≤ 開始）
    _log(data_root, "s90", "g3", "20261019_110000", None, end=None)         # 被中斷
    u = cs.usage_days(now=datetime(2026, 10, 19, 12, 0))
    assert [d["date"] for d in u["daily"]][0] == "2026-10-13" and len(u["daily"]) == 7
    day = {d["date"]: d for d in u["daily"]}
    assert day["2026-10-19"]["tokens"] == 91000 and day["2026-10-19"]["runs"] == 4
    assert day["2026-10-19"]["by_kind"] == {"批次生圖": 90000, "其他": 1000}
    assert day["2026-10-17"]["by_kind"] == {"表情擴寫": 9000}
    assert u["total_tokens"] == 120000 and u["runs"] == 6 and u["failed"] == 1
    assert u["avg_grid_tokens"] == round((50000 + 40000 + 20000) / 3)
    res = {r["name"]: r["result"] for r in u["recent"]}
    assert res == {"g1": "ok", "g2": "timeout", "g3": "unknown", "preview": "ok", "expand": "ok", "single": "ok"}
    assert {r["name"]: r["seconds"] for r in u["recent"]}["single"] is None
    assert {x["key"]: x["label"] for x in u["by_scope"]}["stickers"] == "表情"
    assert u["recent"][0]["name"] == "g3"


def test_status_endpoint(client, monkeypatch):
    from app import codex_status as cs
    monkeypatch.setattr(cs, "check", lambda force=False: {"cli": {"found": False}, "login": {"ok": False, "text": "x", "pending": False}})
    d = client.get("/api/codex-status").json()
    assert {"cli", "login", "rate", "running", "usage", "sessions_dir"} <= d.keys()
    assert len(d["usage"]["daily"]) == 7


def test_usage_cache_and_filter(data_root, monkeypatch):
    """太舊的 log 不解析；沒變的 log 第二次直接用快取；log 有變就重讀"""
    from app import codex_status as cs
    old = _log(data_root, "s91", "g1", "20260901_100000", 1234)
    p = _log(data_root, "s91", "g2", "20261019_090000", 1000)
    calls = []
    real = cs._parse
    monkeypatch.setattr(cs, "_parse", lambda path: calls.append(path.name) or real(path))
    now = datetime(2026, 10, 19, 12, 0)
    cs._parse_cache.clear()
    cs.usage_days(now=now)
    assert old.name not in calls and p.name in calls
    calls.clear()
    u = cs.usage_days(now=now)
    assert calls == []                                   # 全部走快取
    assert any(r["log"].endswith(p.name) and r["tokens"] == 1000 for r in u["recent"])
    import os
    p.write_text(p.read_text(encoding="utf-8").replace("1,000", "2,000"), encoding="utf-8")
    st = p.stat()
    os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
    u = cs.usage_days(now=now)
    assert calls == [p.name]
    assert any(r["log"].endswith(p.name) and r["tokens"] == 2000 for r in u["recent"])

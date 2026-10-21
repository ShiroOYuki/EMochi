"""回報問題的診斷資訊：不呼叫真的 Codex、家目錄要遮掉"""

from pathlib import Path


def _fake_check(found=True, ok=True):
    return lambda force=False: {
        "cli": {"found": found, "version": "codex-cli 9.9.9" if found else None},
        "login": {"ok": ok, "text": ""},
    }


def test_mask_home():
    from app import diagnostics

    home = str(Path.home())
    assert diagnostics.mask(f"{home}/AppData/x.log") == "~/AppData/x.log"


def test_collect(monkeypatch):
    from app import codex_status, diagnostics

    monkeypatch.setattr(codex_status, "check", _fake_check())
    monkeypatch.setattr(
        codex_status,
        "usage_days",
        lambda: {
            "recent": [
                {
                    "time": "2026-10-20 10:00:00",
                    "scope_label": "s1",
                    "kind": "批次生圖",
                    "name": "g1",
                    "result": "timeout",
                    "log": str(Path.home() / "logs" / "g1.log"),
                },
                {
                    "time": "2026-10-20 09:00:00",
                    "scope_label": "s1",
                    "kind": "批次生圖",
                    "name": "g2",
                    "result": "ok",
                    "log": "x",
                },
            ]
        },
    )
    d = diagnostics.collect("1.2.3", desktop=True)
    assert d["version"] == "1.2.3" and d["codex"] == "codex-cli 9.9.9・已登入"
    assert "v1.2.3（桌面版" in d["text"] and "timeout" in d["text"] and "g2" not in d["text"]
    assert str(Path.home()) not in d["text"]


def test_collect_no_codex(monkeypatch):
    from app import codex_status, diagnostics

    monkeypatch.setattr(codex_status, "check", _fake_check(found=False, ok=False))
    monkeypatch.setattr(codex_status, "usage_days", lambda: {"recent": []})
    d = diagnostics.collect()
    assert d["codex"] == "找不到 Codex CLI" and d["version"] == diagnostics.source_version()


def test_diagnostics_endpoint(client, monkeypatch):
    from app import codex_status

    monkeypatch.setattr(codex_status, "check", _fake_check())
    monkeypatch.setattr(codex_status, "usage_days", lambda: {"recent": []})
    r = client.get("/api/diagnostics?app_version=0.9.0&desktop=1").json()
    assert r["version"] == "0.9.0" and r["text"].startswith("EMochi：v0.9.0")

"""找 Codex：App 開著時才裝好 Codex（登錄檔的 PATH 變了），重新檢查要找得到"""

import os


def test_refresh_path_adds_new_entries(monkeypatch, tmp_path):
    from app import codex

    a, b = tmp_path / "a", tmp_path / "b"
    monkeypatch.setenv("PATH", str(a))
    assert codex.refresh_path([str(a), str(b), str(b) + os.sep]) is True
    parts = os.environ["PATH"].split(os.pathsep)
    assert parts == [str(a), str(b)]  # 原本的順序不動、重複（含結尾斜線）不加
    assert codex.refresh_path([str(b)]) is False


def test_codex_bin_retries_after_refresh(monkeypatch):
    from app import codex

    calls = []
    found = {"v": None}
    monkeypatch.setattr(codex.shutil, "which", lambda name: calls.append(name) or found["v"])

    def fake_refresh():
        found["v"] = r"C:\new\codex.cmd"
        return True

    monkeypatch.setattr(codex, "refresh_path", fake_refresh)
    assert codex.codex_bin() == r"C:\new\codex.cmd" and len(calls) == 2


def test_codex_bin_missing(monkeypatch):
    import pytest

    from app import codex

    monkeypatch.setattr(codex.shutil, "which", lambda name: None)
    monkeypatch.setattr(codex, "refresh_path", lambda: False)
    with pytest.raises(RuntimeError):
        codex.codex_bin()


def test_codex_check_endpoint(client, monkeypatch):
    from app import codex_status

    seen = []
    monkeypatch.setattr(
        codex_status,
        "check",
        lambda force=False: seen.append(force) or {"cli": {"found": False}, "login": {"ok": False}},
    )
    assert client.get("/api/codex-check").json()["cli"]["found"] is False
    client.get("/api/codex-check?refresh=1")
    assert seen == [False, True]

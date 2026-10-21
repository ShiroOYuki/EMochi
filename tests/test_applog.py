"""app.log：寫入、輪替、diagnostics 附最後幾行"""

import logging

from app import applog


def test_write_rotate_and_tail(data_root, monkeypatch):
    path = applog.log_path()
    for p in (path, path.with_name("app.log.1"), path.with_name("app.log.2")):
        p.unlink(missing_ok=True)
    handler = applog._AppLogHandler(logging.WARNING)
    handler.setFormatter(logging.Formatter("%(message)s"))
    log = logging.getLogger("app.test_applog")
    log.addHandler(handler)
    try:
        log.warning("第一筆")
        log.info("info 不寫")
        assert applog.tail() == ["第一筆"]

        monkeypatch.setattr(applog, "MAX_BYTES", 10)
        log.warning("超過大小 → 輪替")
        log.warning("新檔第一筆")
        assert path.with_name("app.log.1").exists()
        assert applog.tail() == ["新檔第一筆"]
    finally:
        log.removeHandler(handler)
        for p in (path, path.with_name("app.log.1"), path.with_name("app.log.2")):
            p.unlink(missing_ok=True)


def test_diagnostics_includes_tail(client, monkeypatch):
    monkeypatch.setattr(applog, "tail", lambda n=20: ["2026-10-21 ERROR app.server: 測試錯誤"])
    text = client.get("/api/diagnostics").json()["text"]
    assert "程式記錄" in text and "測試錯誤" in text

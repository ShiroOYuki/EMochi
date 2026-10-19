"""桌面版相關：health（Electron 啟動時等它、關閉前看有沒有 Codex 在跑）、程式與資料位置分開"""


def test_health(client, data_root):
    h = client.get("/api/health").json()
    assert h["ok"] and h["root"] == str(data_root.resolve()) and h["frozen"] is False
    assert h["codex_running"] == 0 and h["busy"] is None


def test_builtin_config_follows_program(data_root):
    """內建設定（prompt 模板、example）跟著程式走，不在資料根目錄；打包後資料根目錄裡不會有它們"""
    from app import paths
    assert paths.BUILTIN_CONFIG == paths.APP_ROOT / "config"
    assert paths.STATIC == paths.APP_ROOT / "app" / "static"
    assert (paths.BUILTIN_CONFIG / "prompt_template.json").exists()


def test_alive():
    import os

    from app.__main__ import _alive
    assert _alive(os.getpid())
    assert not _alive(999_999_999 % 2**31)

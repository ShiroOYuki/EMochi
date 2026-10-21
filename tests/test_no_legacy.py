"""移除舊機制後（2026-10-19）：設定檔、沒有描述的舊專案匯入畫風庫、擴寫範例"""

import json

from conftest import make_grid


def test_settings_defaults_and_file(data_root):
    from app import settings

    assert settings.get("codex_args")[:1] == ["exec"]
    settings.update({"codex_args": ["exec", "-s", "workspace-write"], "unknown": 1})
    saved = json.loads((data_root / "settings.local.json").read_text(encoding="utf-8"))
    assert saved == {"codex_args": ["exec", "-s", "workspace-write"]}
    assert settings.get("codex_args") == ["exec", "-s", "workspace-write"]
    settings.update({"codex_args": settings.DEFAULTS["codex_args"]})  # 和預設一樣就不存
    assert json.loads((data_root / "settings.local.json").read_text(encoding="utf-8")) == {}
    (data_root / "settings.local.json").unlink()


def _project(root, sid, block="", groups=1):
    out = root / "outputs" / sid
    gs = []
    for n in range(1, groups + 1):
        img = make_grid(out / "grids" / f"{sid}_group{n}.png", 4, 2, 64)
        gs.append(
            {
                "index": n,
                "ids": list(range(8 * n - 7, 8 * n + 1)),
                "layout": "4x2",
                "prompt": "",
                "refs": [],
                "image": img.relative_to(root).as_posix(),
                "status": "done",
            }
        )
    p = {
        "id": sid,
        "name": f"舊 {sid}",
        "request": "",
        "style_block": block,
        "framing": "closeup",
        "process": {"square": 0.5, "margin": 0},
        "notes_zh": "",
        "refs": {"character_id": None, "character_images": None, "temp": []},
        "status": "done",
        "error": None,
        "preview": None,
        "sticker_ids": [],
        "groups": gs,
    }
    (out / "project.json").write_text(json.dumps(p, ensure_ascii=False), encoding="utf-8")


def test_import_project_without_block(client, data_root):
    _project(data_root, "s81")
    items = {o["id"]: o for o in client.get("/api/style-lib/importable").json()}
    assert items["s81"]["needs_analyze"] is True and items["s81"]["image"].endswith("s81_group1.png")
    r = client.post("/api/style-lib/import", json={"project": "s81"})
    assert r.status_code == 200, r.text
    lib = r.json()
    assert lib["source_project"] == "s81" and lib["style_block"] == "" and len(lib["images"]) == 1


def test_style_examples(data_root):
    """範例畫風描述來自內建的 config/style_examples.example.json（s5、s4 的描述），不再讀使用者的專案"""
    import json

    from app import jobs

    _project(data_root, "s5", block="- soft pastel shading")
    builtin = [e["style_block"] for e in json.loads(jobs.STYLE_EXAMPLES.read_text(encoding="utf-8"))]
    ex = jobs.style_examples()
    assert ex == builtin[:2] and "- soft pastel shading" not in ex
    assert len(ex) == 2 and all(b.startswith("- ") for b in ex)


def test_codex_prefers_mxc(data_root, monkeypatch):
    """生圖、文字任務都加上 --enable prefer_mxc（優先用 MXC，不強制）"""
    from app import codex

    seen = []
    monkeypatch.setattr(codex, "codex_bin", lambda: "codex")
    monkeypatch.setattr(codex, "_run", lambda cmd, *a, **k: (seen.append(cmd), (1, "exit"))[1])
    codex.run_image("p", ["a.png"], "outputs/x.png", "2x2", data_root / "logs" / "t" / "x.log")
    try:
        codex.run_text("p", data_root / "s.json", data_root / "logs" / "t" / "y.log")
    except RuntimeError:
        pass
    for cmd in seen:
        i = cmd.index("--enable")
        assert cmd[i + 1] == "prefer_mxc" and "windows.sandbox=mxc" not in " ".join(cmd)
    assert len(seen) == 2

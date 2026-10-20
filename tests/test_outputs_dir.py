"""專案輸出資料夾可以改位置：project.json 記邏輯路徑 outputs/...，生圖時換成實際路徑並加 --add-dir"""

import json
import tempfile
from pathlib import Path

import pytest
from conftest import make_grid


@pytest.fixture
def clean(data_root):
    yield
    f = data_root / "settings.local.json"
    if f.exists():
        f.unlink()


@pytest.fixture
def ext():
    return Path(tempfile.mkdtemp(prefix="emochi_out_"))


def _project(root: Path, sid: str) -> Path:
    make_grid(root / sid / "grids" / f"{sid}_preview.png", 2, 2, 256)
    f = root / sid / "project.json"
    f.write_text(
        json.dumps(
            {
                "id": sid,
                "name": "t",
                "status": "preview_ready",
                "style_block": "x",
                "framing": "closeup",
                "preview": {
                    "image": f"outputs/{sid}/grids/{sid}_preview.png",
                    "layout": "2x2",
                    "status": "done",
                },
                "groups": [],
            }
        ),
        encoding="utf-8",
    )
    return f


def test_paths_follow_setting(data_root, clean, ext):
    from app import paths, settings

    assert paths.data_path("outputs/s1/a.png") == data_root.resolve() / "outputs" / "s1" / "a.png"
    assert paths.stored_path(data_root / "outputs" / "s1" / "a.png") == "outputs/s1/a.png"
    settings.save({"outputs_dir": str(ext)})
    assert paths.outputs_dir() == ext.resolve()
    assert paths.data_path("outputs/s1/a.png") == ext.resolve() / "s1" / "a.png"
    assert paths.stored_path(ext / "s1" / "a.png") == "outputs/s1/a.png"  # 邏輯路徑不變
    assert paths.to_codex("outputs/s1/a.png") == (ext / "s1" / "a.png").resolve().as_posix()
    assert paths.data_path("characters/c1/refs/r.png") == data_root / "characters/c1/refs/r.png"
    assert paths.from_url("outputs/s1/a.png") == (ext / "s1" / "a.png").resolve()  # 網址前綴跟著新位置


def test_run_image_add_dir_and_localize(data_root, clean, ext, monkeypatch):
    from app import codex, settings

    seen = {}
    monkeypatch.setattr(codex, "codex_bin", lambda: "codex")
    monkeypatch.setattr(
        codex, "_run", lambda cmd, prompt, *a, **k: (seen.update(cmd=cmd, prompt=prompt), (1, "exit"))[1]
    )
    prompt = "use outputs/s1/grids/s1_preview.png\n\nSave the result as outputs/s1/grids/s1_group1.png (inside the current folder)."
    codex.run_image(
        prompt,
        ["characters/c1/refs/r.png", "outputs/s1/grids/s1_preview.png"],
        "outputs/s1/grids/s1_group1.png",
        "4x2w",
        data_root / "logs" / "t" / "a.log",
    )
    assert "--add-dir" not in seen["cmd"] and seen["prompt"] == prompt  # 預設位置：完全不變
    settings.save({"outputs_dir": str(ext)})
    codex.run_image(
        prompt,
        ["characters/c1/refs/r.png", "outputs/s1/grids/s1_preview.png"],
        "outputs/s1/grids/s1_group1.png",
        "4x2w",
        data_root / "logs" / "t" / "b.log",
    )
    cmd, out = seen["cmd"], ext.resolve().as_posix()
    assert cmd[cmd.index("--add-dir") + 1] == str(ext.resolve())
    assert cmd.index("--add-dir") < cmd.index("-i")
    assert f"{out}/s1/grids/s1_preview.png" in cmd and "characters/c1/refs/r.png" in cmd
    assert f"Save the result as {out}/s1/grids/s1_group1.png." in seen["prompt"]
    assert "inside the current folder" not in seen["prompt"] and seen["prompt"].count("outputs/s1") == 0


def test_localize_dir_named_outputs(data_root, clean, ext):
    """資料夾名稱本身以 outputs 結尾（例如 e2e_outputs）：換好的路徑不能再被換一次（實測抓到的 bug）"""
    from app import codex, settings

    settings.save({"outputs_dir": str(ext / "my_outputs")})
    out = (ext / "my_outputs").resolve().as_posix()
    p = codex.localize(
        "A outputs/s1/refs/a.png B\n\nSave the result as outputs/s1/grids/s1_preview.png (inside the current folder).",
        ["outputs/s1/grids/s1_preview.png", "outputs/s1/refs/a.png"],
    )
    assert p == f"A {out}/s1/refs/a.png B\n\nSave the result as {out}/s1/grids/s1_preview.png."


def test_move_outputs(client, data_root, clean, ext):
    from app import jobs, paths

    proj = _project(data_root / "outputs", "s80")
    before = proj.read_text(encoding="utf-8")
    new = ext / "out"
    chk = client.post("/api/settings/check", json={"key": "outputs_dir", "value": str(new)}).json()
    assert chk["error"] is None and "--add-dir" in chk["warn"]
    r = client.put("/api/settings", json={"changes": {"outputs_dir": str(new)}, "move": True})
    assert r.status_code == 200, r.text
    assert (new / "s80" / "project.json").read_text(encoding="utf-8") == before  # project.json 不用改
    assert not proj.exists() and paths.outputs_dir() == new.resolve()
    assert "--add-dir" in r.json()["codex_command"]
    assert client.get("/files/outputs/s80/grids/s80_preview.png").status_code == 200
    assert jobs.load("s80")["id"] == "s80"
    assert any(p["id"] == "s80" for p in jobs.list_projects())
    # 其他資料夾不能用資料根目錄下的 outputs 這個名字
    assert client.post(
        "/api/settings/check", json={"key": "logs_dir", "value": str(data_root / "outputs")}
    ).json()["error"]
    # 搬回預設
    r = client.put(
        "/api/settings", json={"changes": {"outputs_dir": str(data_root / "outputs")}, "move": True}
    )
    assert r.status_code == 200 and proj.exists()
    assert "--add-dir" not in r.json()["codex_command"]

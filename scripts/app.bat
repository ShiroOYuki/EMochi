@echo off
chcp 65001 >nul
rem EMochi 網頁工具（Gen + Gallery）→ http://127.0.0.1:8765
cd /d "%~dp0.."
uv run python -m app
pause

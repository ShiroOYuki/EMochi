@echo off
rem AI Sticker 網頁工具（Gen + Gallery）→ http://127.0.0.1:8765
chcp 65001 >nul
cd /d "%~dp0.."
uv run python -m app
pause

@echo off
rem 用法：scripts\process.bat s5
chcp 65001 >nul
cd /d "%~dp0.."
uv run tools\process_style.py %*
pause

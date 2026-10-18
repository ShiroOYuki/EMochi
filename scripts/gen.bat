@echo off
rem 用法：scripts\gen.bat s5   或   scripts\gen.bat s5 -g 2 4
chcp 65001 >nul
cd /d "%~dp0.."
uv run tools\gen.py %*

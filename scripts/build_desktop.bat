@echo off
chcp 65001 >nul
rem Build the desktop app locally: web build -> backend (PyInstaller) -> Electron installer (desktop\release).
rem   scripts\build_desktop.bat --dir   unpacked folder only (desktop\release\win-unpacked)
rem Releases for users are built by GitHub Actions instead (scripts\release.bat + release.yml).
cd /d "%~dp0.."

echo [1/3] 前端
pushd web
call npm run build || goto :fail
popd

echo [2/3] 後端（PyInstaller）
uv run --group desktop pyinstaller desktop\emochi-server.spec --noconfirm --distpath dist --workpath build || goto :fail

echo [3/3] Electron
pushd desktop
if not exist node_modules call npm install || goto :fail
if "%~1"=="--dir" (call npx electron-builder --dir) else (call npx electron-builder)
if errorlevel 1 goto :fail
popd
echo 完成：desktop\release
exit /b 0

:fail
echo 打包失敗
exit /b 1

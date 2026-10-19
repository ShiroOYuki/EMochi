@echo off
rem 打包桌面版：前端 build → 後端 PyInstaller → Electron 安裝檔（desktop\release\EMochi Setup <版本>.exe）
rem 只想要免安裝資料夾（desktop\release\win-unpacked）：build_desktop.bat --dir
chcp 65001 >nul
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

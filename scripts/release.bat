@echo off
chcp 65001 >nul
rem Release a new version: bump desktop/package.json (the single source of the app version), commit, tag.
rem After the tag is pushed, GitHub Actions (release.yml) builds the installer and publishes it to Releases,
rem and installed copies of EMochi pick up the update automatically. See docs/DEVELOPMENT.md.
rem   scripts\release.bat 0.2.0          bump + commit + tag locally (push yourself: git push origin main v0.2.0)
rem   scripts\release.bat 0.2.0 --push   also push (starts the release build)
setlocal
cd /d "%~dp0.."
set "VER=%~1"
if "%VER%"=="" (echo 用法：scripts\release.bat 0.2.0 [--push] & exit /b 1)

for /f %%b in ('git branch --show-current') do set "BRANCH=%%b"
if not "%BRANCH%"=="main" (echo 請在 main 分支發版（目前在 %BRANCH%） & exit /b 1)
git diff --quiet && git diff --cached --quiet || (echo 有還沒 commit 的變更，先處理再發版 & exit /b 1)
git rev-parse -q --verify "refs/tags/v%VER%" >nul && (echo tag v%VER% 已經存在 & exit /b 1)

pushd desktop
call npm version %VER% --no-git-tag-version || (popd & exit /b 1)
popd

git add desktop/package.json desktop/package-lock.json || exit /b 1
git commit -q -m "release: v%VER%" || exit /b 1
git tag -a "v%VER%" -m "EMochi v%VER%" || exit /b 1
echo 已建立 v%VER%（commit＋tag）

if /i "%~2"=="--push" (
  git push origin main "v%VER%" || exit /b 1
  echo 已推上去，GitHub Actions 開始打包：https://github.com/ShiroOYuki/EMochi/actions
) else (
  echo 確認沒問題後推上去：git push origin main v%VER%
)

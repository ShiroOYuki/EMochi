# EMochi 開發說明

給要修改、打包或發版 EMochi 的人。一般使用請看 [README](../README.md)。

## 環境需求

- Windows（指令以 cmd 為例）
- [uv](https://docs.astral.sh/uv/)：`winget install astral-sh.uv`
- [Codex CLI](https://github.com/openai/codex)（使用 ChatGPT 額度），需在 PATH 中並已登入
- 改前端、打包桌面版才需要 Node.js

```cmd
git clone https://github.com/ShiroOYuki/EMochi.git
cd EMochi
uv sync
```

## 從原始碼執行

### 網頁版

```cmd
scripts\app.bat          :: 或 uv run python -m app（可加 --port N --no-browser）
```

瀏覽器會開啟 http://127.0.0.1:8765 。從原始碼執行時，資料（outputs、characters、style_lib、config 等）預設放在專案資料夾裡。

### 桌面版（開發模式）

```cmd
cd desktop
npm install
npm run dev
```

用 uv 跑原始碼的後端，資料和網頁版共用專案資料夾。開發模式的視窗設定、記錄檔、瀏覽器資料放在 `%APPDATA%\EMochi-dev`、後端優先用 port 38766，和安裝版（`%APPDATA%\EMochi`、38765）分開，兩個可以同時開。

架構：Electron（`desktop/main.js`）找一個空的 port 啟動後端 → 等 `/api/health` → 視窗載入同一套 React 前端；選資料夾等原生功能走 `desktop/preload.js` 的 `window.emochi`。

### 修改前端

```cmd
cd web
npm ci
npm run dev        :: http://localhost:5173（API 轉給 8765，需先開 scripts\app.bat）
npm run build      :: 輸出到 app\static，提交時一起 commit
npm run gen:api    :: 後端改了請求或回應格式（Pydantic model、app/schemas.py）後，重新產生 src\api\schema.d.ts
```

改後端（`app/*.py`）要重開伺服器；改前端 build 完重新整理瀏覽器即可。

## 格式與 lint

```cmd
uv run ruff check          :: 後端 lint（--fix 自動修）
uv run ruff format         :: 後端格式化
cd web
npm run lint               :: eslint
npm run format             :: prettier（format:check 只檢查）
```

CI 會檢查這些，沒過不能合併。`git blame` 要略過整批格式化的 commit：`git config blame.ignoreRevsFile .git-blame-ignore-revs`。

## 測試

```cmd
uv sync
uv run pytest              :: 後端
cd web && npm test         :: 前端（Vitest，純函式與 store 邏輯）
```

測試會用 `EMOCHI_ROOT` 把資料根目錄指到暫存資料夾，不會動到 `outputs/`、`characters/` 等真正的資料，也不會呼叫 Codex。
涵蓋：`/files/` 快取與 304、匯出規格檢查、Gallery 掃描／匯出／勾選清單、角色垃圾桶流程、3×2 網格切割去背、`generation_finished()`、額度窗口過期、空資料夾啟動、表情與分組、Codex 用量統計、設定檔、匯出預設集、錯誤狀態碼、PATCH 驗證、資料檔升級、app.log。

## 打包桌面版

需要 uv、Node.js：

```cmd
scripts\build_desktop.bat          :: 前端 build → 後端 PyInstaller（dist\emochi-server）→ Electron 安裝檔
scripts\build_desktop.bat --dir    :: 只要免安裝資料夾 desktop\release\win-unpacked
```

安裝檔輸出到 `desktop\release\EMochi Setup <版本>.exe`。安裝版的資料預設在 `%LOCALAPPDATA%\EMochi`，記錄檔在 `%APPDATA%\EMochi\logs\`。安裝檔沒有程式碼簽章，執行時 Windows SmartScreen 會警告。

## 分支與發版

- 新功能從 `develop` 開 `feat/*`，做完合併回 `develop`
- 要發大版本時把 `develop` 合併進 `main`，在 main 上發版
- hotfix 從 `main` 開，合回 `main` 和 `develop`

發新版（在 main 分支、沒有未 commit 的變更）：

```cmd
scripts\release.bat 0.2.0 --push    :: 改 desktop/package.json 版號 → commit → 打 tag v0.2.0 → 推上去
```

版本號唯一來源是 `desktop/package.json`。推上 `v*` tag 後，GitHub Actions（`.github/workflows/release.yml`）會跑測試、打包，並把安裝檔、`latest.yml`、`.blockmap` 發到 [Releases](https://github.com/ShiroOYuki/EMochi/releases)，已安裝的 EMochi 就會收到更新。平常推 main／develop、開 PR 只跑 `ci.yml`（後端測試＋前端 build）。repo 必須是公開的，App 才下載得到 Releases。

### 自動更新的行為

安裝版啟動 10 秒後、之後每 6 小時檢查一次 Releases，只檢查、不自動下載：有新版時 Navbar 出現「v0.x.x 可更新」，按了才下載（只下載變動的部分），下載好再按「重新啟動並安裝」。不按就不會安裝（關閉 App 時也不會自動裝）。開發模式不檢查。記錄在 `%APPDATA%\EMochi\logs\updater.log`。

## 資料夾結構

```
app/                後端（FastAPI）
  server.py         建立 FastAPI、統一錯誤處理（errors.py 的例外 → 對應狀態碼，其他 → 500）、掛上前端
  errors.py         NotFound（404）、Invalid（400）、Conflict（409）、CodexError（502）
  routes/           API 路由，依領域分檔：system、settings、stickers、files、projects、library、gallery
  jobs/             Gen 流程（store 讀寫 project.json、refs 參考圖、prompting 組 prompt、
                    runner 背景執行、flow 狀態轉換）；project_types.py 是專案資料的型別與狀態
  schemas.py        API 回應的形狀（response_model）；前端型別由它和請求 model 自動產生
  migrations.py     資料檔格式升級（project.json、character.json、style.json 的 schema_version）
  codex.py          執行 Codex；applog.py 程式記錄（logs/app.log）
  pipeline.py       網格 → 成品（去背核心在 keying.py）；gallery.py 匯出、組合；specs.py 平台規格檢查；prompts.py 組 prompt
  presets.py        匯出預設集；stickers.py 表情與分組；settings.py 設定（Settings model 是唯一來源）
  characters.py     角色庫；style_lib.py 畫風庫（共用 reflib.py）；trash.py 垃圾桶；usage.py Codex 額度
  static/           前端 build 結果（由 web/ 產生）
web/                前端原始碼（React 19 + Vite + TypeScript + Tailwind 4 + Animate UI + TanStack Query）
  src/api/          後端呼叫：projects／library／gallery／stickers／settings／system 各領域的 xxxApi、
                    types.ts（取自 schema.d.ts 的型別別名）、schema.d.ts 自動產生的請求／回應型別、queries.ts 快取與輪詢
  src/router.ts     網址路由（react-router hash router）：#/gen/s12、#/characters/c2…；
                    App.tsx 是 Layout，五個分頁用 <Activity> 切換（隱藏時保留輸入、effect 暫停）
  src/hooks/useOnChange.ts  「值變了才重設表單／聚焦」用這個，不要用 useEffect（切回分頁時 effect 會重跑）
  src/pages/        五個分頁；gen/ 生成頁各步驟、gallery/ 圖庫的篩選與面板
  src/components/   共用元件；ui/ 一個元件一個檔
  src/hooks/        useStored（localStorage 記憶）、useViewTransition 等
tests/              pytest
config/
  stickers.example.json  基礎 32 種表情（編號、名稱、中文說明、表情 prompt）；stickers.json 的起點
  export_presets.example.json  內建匯出預設集（各平台規格，2026-10-20 查）；export_presets.json 的起點
  style_examples.example.json  擴寫／分析畫風時給 Codex 看的範例描述
  style_lib.example/  內建範例畫風（st1）；全新安裝第一次啟動時複製到畫風庫（素材授權見 ASSETS-LICENSE.md）
  sticker_groups.example.json  預設 4 組表情分組
  prompt_template.json  Gen 組 prompt 用的共用段落：構圖、版面規則、預覽用表情
  stickers.json、sticker_groups.json、export_presets.json  使用者資料          ※不進版控
settings.local.json 設定頁的設定（只記和預設不同的值）                         ※不進版控
characters/         角色庫                                                    ※不進版控
style_lib/          畫風庫                                                    ※不進版控
docs/
  DEVELOPMENT.md    本文件
  GUIDE.md          prompt 撰寫說明（早期手寫 prompt 時的參考）
scripts/app.bat     啟動網頁版
scripts/build_desktop.bat  打包桌面版（本機）
scripts/release.bat 發新版（改版號、打 tag）
.github/workflows/  ci.yml（測試）、release.yml（v* tag 打包發版）
desktop/
  main.js           Electron 主程序：啟動後端、視窗、關閉時清理
  updater.js        自動更新（electron-updater）
  preload.js        給前端的原生功能
  emochi-server.spec  PyInstaller 打包後端
  server_entry.py   打包後端的進入點
  make_icon.py      產生 assets/icon.png、icon.ico
  release/          打包產物                                                  ※不進版控
outputs/<專案>/     grids/（網格原圖）、final/（成品）、previews/（總覽圖）      ※不進版控
exports/            匯出的 zip 與勾選清單                                      ※不進版控
logs/               Codex 執行紀錄、app.log（程式警告與錯誤）                  ※不進版控
archive/            試驗品、檢查腳本                                          ※不進版控
```

## 資料怎麼流動：從按下「生成」到進圖庫

1. 前端 `pages/gen/*` 呼叫 `projectsApi.preview(id)` 等（`web/src/api/projects.ts`）
2. 後端 `routes/projects.py` 收到 → `jobs.flow.start_preview()`：`require_status` 檢查狀態、
   `jobs.prompting` 組 prompt、`jobs.store.mutate` 在鎖內改 project.json → 丟給 `jobs.runner` 背景執行
3. `jobs.runner._run_preview／_run_group` 呼叫 `codex.run_image()`（`codex exec`，等網格圖、檢查背景）
   → 結果寫回 project.json；整批跑完用 `events.emit()` 發桌面通知
4. 前端 `useProject(id)`（`api/queries.ts`）在執行中每 2.5 秒輪詢，畫面跟著更新
5. 使用者確認後 `start_finalize` → `jobs.runner._finalize` → `pipeline.process_grid()` 切割、去背（`keying.py`）、
   輸出各尺寸到 `outputs/<專案>/final/`
6. 圖庫 `gallery.py` 掃 `final/` 列出成品；匯出時依匯出預設集（`presets.py`）縮放、壓縮（`specs.py`）打包成 zip

錯誤：模組丟 `errors.py` 的例外 → `server.py` 轉成狀態碼與 `{detail}` → 前端 `api/client.ts` 丟 `ApiError`，畫面顯示 `detail`。

## 實作備忘

- 每個專案的進度（含每組實際送出的 prompt）存在 `<專案輸出資料夾>/<專案>/project.json`；裡面記的一律是 `outputs/...` 邏輯路徑，搬家不用改
- 專案輸出放在資料根目錄外時，生圖會加 `--add-dir <該資料夾>` 讓 Codex 的沙盒能寫入
- Windows 上呼叫 Codex 時固定加 `--enable prefer_mxc`：能用 MXC 沙盒就用，不能用（Windows 10、較舊的 Windows 11）時 Codex 自動退回舊模式。只影響 EMochi 的呼叫，不改 `~/.codex/config.toml`
- Codex 額度讀 `~/.codex/sessions` 的紀錄（5 小時／每週窗口）
- 角色身上若有大面積綠色，把 prompt 的 `#00FF00` 換成 `#FF00FF`，`app/keying.py` 會自動偵測背景色
- 批次檔：CRLF、`chcp 65001` 放第二行、開頭 rem 用英文

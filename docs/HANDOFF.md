# AI Sticker — 進度交接（2026-10-18）

## 專案位置與啟動
- 位置：`D:\CODE\Experimental\EMochi`（git、uv、pyproject.toml）
- 啟動：`scripts\app.bat`（= `uv run python -m app`），網址 http://127.0.0.1:8765
- 改後端（app/*.py）要重開伺服器；改前端要在 `web/` 跑 `npm run build`（輸出到 `app/static`），瀏覽器重新整理
- 回覆一律用繁體中文

## 技術架構
- 後端：FastAPI + uvicorn（Python 3.12），狀態存 JSON（`outputs/<s>/project.json`），背景執行緒池，同時最多 3 組生圖
- 前端：React 18 + Vite 5 + TS + Tailwind 4，粉圓字體（@fontsource/huninn），可切換深淺色主題，hash 路由 `#/gen` `#/characters` `#/gallery`
- 生圖：Codex CLI 0.162.1 `codex exec -s workspace-write -i <參考圖> -`（prompt 走 stdin）；擴寫/看圖寫特徵用 `-s read-only --ephemeral --output-schema -o`
- 後處理：`tools/postprocess.py`（去綠幕 unmix + despill、choke、去雜點、裁切），尺寸 512 master / Twitch 112·56·28 / Discord 128

## 主要檔案
| 檔案 | 用途 |
|---|---|
| `app/server.py` | 所有 API；回傳專案一律經過 `jobs.view(p)`（補 refs / ref_paths） |
| `app/jobs.py` | 狀態機 expanding→draft→previewing→preview_ready→generating→review→processing→done；參考圖邏輯 `refs_of` / `ref_paths` / 暫時參考圖；`recheck` |
| `app/characters.py` | 角色庫 `characters/<id>/character.json + refs/`；圖片統一命名 `ref_01.png…`（流水號只增不減）；啟動時 `normalize_names()` 自動改名並更新引用；`describe()` 讓 Codex 看圖寫特徵句 |
| `app/prompts.py` | prompt 模板組裝；`ref_line()` 依圖片用途（角色 / 畫風 / 核准樣張）產生說明 |
| `app/codex.py` | 執行 Codex、輪詢、kill tree；`check_image` 背景檢查（看格間走道與外框，門檻用 s1～s5 實際網格校準） |
| `app/images.py` | 上傳圖片處理（data URL → PNG、長邊 1536、移除改放 `_removed/`） |
| `app/pipeline.py` / `app/gallery.py` | 切格去背輸出 / Gallery 掃描、匯出、合併、選取 JSON |
| `web/src/pages/Gen.tsx` `Characters.tsx` `Gallery.tsx` | 三個分頁 |
| `web/src/components/RefPicker.tsx` | 角色快選、挑附圖、暫時參考圖（角色 / 畫風兩種用途） |
| `config/prompt_template.json` `stickers.json` `styles.json` | 模板、表情清單、畫風設定 |

## 已完成（最近的 commit）
- 5ab75fb 背景檢查改看格間走道，修正特寫構圖被誤判失敗；新增「重新檢查」（不重生、不花額度），失敗時仍顯示圖
- f9da7d9 修正操作後整頁白畫面（API 回傳欄位不一致）；每個分頁加 ErrorBoundary
- e852b8e 角色圖片統一命名為 `ref_01.png`…
- 721dcd3 新增角色庫（角色分頁）與暫時參考圖；畫風參考圖也會給擴寫用；生成批次時只附角色圖＋核准樣張
- 更早：網頁工具 Gen + Gallery、可愛風 UI、深色主題

## 目前狀態
- 畫風 s6、s7 是用網頁工具建立的；s7（Q 版可愛，角色 c2）的預覽圖其實正常，重開伺服器後在預覽區按「重新檢查」即可進入「預覽完成」
- 角色：c1 白狐（原角色）、c2（使用者新增）
- 未納入 git：`characters/`、`prompts/s7/`（要不要 commit 角色圖由使用者決定）

## 待辦 / 可以接著做
- 使用者自己寫：`app/codex.py` 的 `generation_finished()`（判斷 Codex 生圖完成、提早結束，目前回傳 False 只靠輪詢檢查檔案）
- 用真的 Codex 跑完整流程（s7 預覽 → 選貼圖 → 生成 → 審核 → 放入 Gallery），目前只有假 codex 測過完整流程
- 角色資料夾目前叫 c1、c2；若想用角色名稱當資料夾名可再調整

## 部署方式（給 Claude 的備忘）
- 雲端 scratchpad 改好後打包 tgz → `device_commit_files` 到 `archive\` → Windows `rmdir /s /q app\static && tar xzf archive\x.tgz`
- commit 訊息含中文時用 UTF-8 檔案 `git commit -F`（cmd 是 Big5，直接 echo 會亂碼）
- 不要 kill 使用者開著的伺服器，請使用者自己重開

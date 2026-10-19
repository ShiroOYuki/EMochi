# EMochi — 進度交接（2026-10-19，1.0）

## 專案位置與啟動
- 位置：`D:\CODE\Experimental\EMochi`（git、uv、pyproject.toml）；remote：`https://github.com/ShiroOYuki/EMochi`
- 啟動：`scripts\app.bat`（= `uv run python -m app`，可加 `--port N --no-browser`），網址 http://127.0.0.1:8765
- 改後端（app/*.py）要重開伺服器；改前端要在 `web/` 跑 `npm run build`（輸出到 `app/static`），瀏覽器重新整理
- 測試：`uv run pytest`（用 `EMOCHI_ROOT` 指到暫存資料夾，不碰真正的資料、不呼叫 Codex）
- 回覆一律用繁體中文

## 技術架構
- 後端：FastAPI + uvicorn（Python 3.12），狀態存 JSON（`outputs/<s>/project.json`），背景執行緒池，同時最多 3 組生圖
- 前端：React 19 + Vite 5 + TS + Tailwind 4 + Animate UI（Radix + Motion），粉圓字體，深淺色主題，hash 路由 `#/gen` `#/styles` `#/characters` `#/gallery`
- 生圖：Codex CLI `codex exec -s workspace-write -i <參考圖> -`（prompt 走 stdin）；擴寫／看圖寫特徵／分析畫風用 `-s read-only --ephemeral --output-schema -o`
- 版型：預覽 2×2；批次預設 **4×2 寬版 2:1**（2048×1024，每組 8 張），備案 **3×2**（1536×1024，每組 6 張）；每格 512 正方形
- 後處理：`tools/postprocess.py` 去綠幕／choke／去雜點；`app/pipeline.cut_cells()` 特寫構圖時同一張網格共用一個正方形裁切框。輸出 512 master / Twitch 112·56·28 / Discord 128
- 資料根目錄：`app/paths.py` 的 `ROOT`（預設＝repo，環境變數 `EMOCHI_ROOT` 可覆蓋）；程式碼根目錄 `APP_ROOT`（`tools/` 從這裡找）

## 主要檔案
| 檔案 | 用途 |
|---|---|
| `app/server.py` | 所有 API；`lifespan` 啟動時建預設角色、整理角色圖檔名、恢復中斷的工作；`/files/`（有 `?v=` → 長快取 immutable；沒有 → no-cache＋ETag／304；zip → no-store） |
| `app/jobs.py` | 狀態機 expanding→draft→previewing→preview_ready→generating→review→processing→done |
| `app/codex.py` | 執行 Codex、輪詢、kill tree；`generation_finished()`（見下）；`check_image()`（比例＋格間走道／外框是純色背景） |
| `app/usage.py` | Codex 額度：讀 `~/.codex/sessions/**/*.jsonl` 最後一筆 `token_count.rate_limits`（primary＝5 小時、secondary＝每週）；過了 `resets_at` 的窗口歸 0 並標 `expired` |
| `app/specs.py` | 平台上傳規格：Twitch 112/56/28、每檔 1 MB；Discord 256 KB。`fit()` 尺寸不符只提醒；超過大小先無損重壓、再降 256 色，仍超過就請手動處理 |
| `app/gallery.py` | Gallery 掃描、匯出 zip（每個檔案過 `specs.fit()`，結果放 `issues`，也寫進同名 JSON）、組合總覽圖、勾選清單 |
| `app/pipeline.py` | 網格 → 成品 |
| `app/characters.py` `style_lib.py` `trash.py` | 角色庫、畫風庫、共用垃圾桶（刪除＝移到 `_removed/`，可還原；永久刪除過的 id 不重用） |
| `app/prompts.py` | `LAYOUTS`、`GROUP_LAYOUTS`、prompt 組裝 |
| `web/src/pages/*.tsx` | Gen、畫風、角色、Gallery 四個分頁 |
| `web/src/components/CodexUsage.tsx` | Navbar 額度；窗口已重置時提示「已在 … 重置（0%，下次跑 Codex 會更新）」 |
| `tests/` | pytest：/files 快取、specs、Gallery 匯出、垃圾桶、3×2 切割、generation_finished、額度過期、空資料夾啟動 |

## generation_finished()
Codex 偶爾畫完圖後還會拖很久才結束。`run_image()` 輪詢 log 時呼叫它，回傳 True 就提早結束程序樹：
1. log 出現回合結束標記 `tokens used\n<數字>`（Codex CLI 每回合結束都會印）
2. 輸出檔是這次寫的（mtime ≥ 開始時間），而且連續兩次輪詢大小與修改時間不變
3. 看到結束標記後再等 `FINISH_GRACE_SEC = 15` 秒，讓 Codex 有機會自己正常結束
4. 圖通過 `check_image()`（只檢查一次並記住結果）

## 1.0 驗證紀錄（2026-10-19）
- Codex 額度：用使用者電腦上的真實 session 紀錄驗證；發現 5 小時窗口已重置卻仍顯示 20%，已修正（`usage._expire`）
- 3×2 實跑：複製 s10（角色 c3、畫風 st1，原本用 4×2 寬版）到獨立資料夾，用 3×2 重跑第 1 組（#1～#6）：2 分 16 秒、60,927 tokens，1536×1024 綠底通過檢查。和原本 4×2 寬版的成品並排比對，臉的大小、裁切、畫風一致。Codex 這次自己在存圖 14 秒後結束，沒用到提早結束
- 匯出規格：現有 256 張成品都遠低於上限（Twitch 112 最大 36.5 KB／上限 1 MB；Discord 128 最大 39.3 KB／上限 256 KB），規格檢查主要是保險

## 功能擴展（待辦）
- 單張重生
- 以範例貼圖為底圖編輯
- 成品微調
- 用量統計
- 匯出預設組合
- 構圖管理
- 前端 code-split（JS gzip 約 193 KB）

## 給下一位的備忘
- commit 訊息含中文時用 UTF-8 檔案 `git commit -F`（cmd 是 Big5，直接 echo 會亂碼）
- 不要 kill 使用者開著的伺服器；測試用另一個 port（例如 8799），可搭配 `EMOCHI_ROOT` 指到複本

# EMochi

EMochi（Emote ＋ Mochi）：用 Codex CLI 的 `$imagegen` 生成角色貼圖，再自動切割、去背、輸出 Twitch / Discord 需要的尺寸。

- 表情清單：基礎 32 種（`config/stickers.example.json`），在「表情」分頁可新增、編輯、刪除、拖進分組；每次可勾選要生成哪些
- 每組生成一張網格圖，背景純綠 `#00FF00` 方便去背：
  - **4×2 寬版 2:1**（預設，2048×1024，每組 8 張，32 張 4 組）
  - **3×2**（1536×1024，每組 6 張；2:1 出問題時的備案）
  - 每格都是 512 正方形
- 輸出：Twitch 112 / 56 / 28、Discord 128、512 高解析母版
- 匯出時自動檢查平台規格：Twitch 每個檔案 1 MB、Discord 256 KB，超過會自動壓縮並列出

## 環境需求

- Windows（指令以 cmd 為例）
- [uv](https://docs.astral.sh/uv/)：`winget install astral-sh.uv`
- [Codex CLI](https://github.com/openai/codex)（使用 ChatGPT 額度），需在 PATH 中
- 改前端才需要 Node.js

```cmd
cd /d D:\CODE\Experimental\EMochi
uv sync
```

## 快速開始：網頁工具

```cmd
scripts\app.bat          :: 或 uv run python -m app（可加 --port N --no-browser）
```

瀏覽器會開啟 http://127.0.0.1:8765 ，有四個分頁：

- **Gen**：新增一套貼圖
  1. 選角色（角色庫）與畫風（畫風庫或暫時參考圖），用中文描述想要的畫風 → Codex 擴寫成英文描述（可修改），並自動判斷構圖與後處理參數
  2. 生成一張 2×2 **風格預覽圖**（Happy / Cry / Angry / Shock）
  3. 喜歡就勾選要生成的貼圖、選版型（4×2 寬版或 3×2），最多 3 組同時生成；預覽圖會當作每一組的畫風範本
  4. 逐組審核，不滿意的按「重生」；全部確認後自動切割、去背、輸出各尺寸
  5. 完成的畫風自動出現在 Gallery
- **畫風**：畫風庫（參考圖＋Codex 分析的畫風描述），也可以從完成的專案匯入
- **角色**：角色庫（參考圖＋特徵句，Codex 可看圖寫特徵）
- **Gallery**：跨畫風並排比較、勾選、匯出 zip（檔名加 `_s6`、`_s6_v1` 版本後綴，含規格檢查）、組合總覽圖、勾選清單 JSON 存讀

刪除的專案、畫風、角色會先進垃圾桶（側欄左下角），可以還原；永久刪除過的編號不會再被使用。
Navbar 右側顯示 Codex 額度（5 小時／每週窗口，讀 `~/.codex/sessions` 的紀錄），點一下看詳細狀態（連線、登入、近 7 天用量）。
Navbar 最右邊的齒輪是設定：Log、設定檔、匯出、角色庫、畫風庫的資料夾位置（可放在專案外，改位置時可把檔案一起搬過去），以及同時生圖組數、預設版型、逾時時間；儲存後立即生效。`outputs/` 不能改位置（Codex 生圖只能寫入專案資料夾）。

每個專案的進度（含每組實際送出的 prompt）存在 `outputs/<專案>/project.json`，關掉伺服器再開也不會遺失。

### 修改前端

```cmd
cd web
npm ci
npm run dev        :: http://localhost:5173（API 轉給 8765，需先開 scripts\app.bat）
npm run build      :: 輸出到 app\static，提交時一起 commit
```

### 測試

```cmd
uv sync
uv run pytest
```

測試會用 `EMOCHI_ROOT` 把資料根目錄指到暫存資料夾，不會動到 `outputs/`、`characters/` 等真正的資料，也不會呼叫 Codex。
涵蓋：`/files/` 快取與 304、匯出規格檢查、Gallery 掃描／匯出／勾選清單、角色垃圾桶流程、3×2 網格切割去背、`generation_finished()`、額度窗口過期、空資料夾啟動、表情與分組、Codex 用量統計、設定檔。

## 資料夾結構

```
app/                網頁工具後端（FastAPI）
  server.py         API 路由；codex.py 執行 Codex；jobs.py Gen 流程狀態機
  pipeline.py       網格 → 成品；gallery.py 匯出、組合；specs.py 平台規格檢查；prompts.py 組 prompt
  characters.py     角色庫；style_lib.py 畫風庫；trash.py 垃圾桶；usage.py Codex 額度
  static/           前端 build 結果（由 web/ 產生）
web/                前端原始碼（React 19 + Vite + TypeScript + Tailwind 4 + Animate UI）
tests/              pytest
config/
  stickers.example.json  基礎 32 種表情（編號、名稱、中文說明、表情 prompt）；stickers.json 的起點
  stickers.json     你的表情清單（本地資料，不進版控；第一次在網頁上修改時才產生）
  sticker_groups.example.json  預設 4 組表情分組
  sticker_groups.json   你的表情分組（本地資料，不進版控；沒有時用 example）
  prompt_template.json  Gen 組 prompt 用的共用段落：構圖、版面規則、預覽用表情
settings.local.json 設定頁的設定（本地資料，不進版控；只記和預設不同的值）
characters/         角色庫（不進版控）
style_lib/          畫風庫（不進版控）
docs/
  GUIDE.md          prompt 撰寫說明（早期手寫 prompt 時的參考）
  HANDOFF.md        開發交接
tools/
  postprocess.py    切割、去背、縮放的核心（app/pipeline.py 使用）
scripts/app.bat     雙擊啟動網頁工具
outputs/<專案>/     grids/（網格原圖）、final/（成品）、previews/（總覽圖）  ※不進版控
exports/            匯出的 zip 與勾選清單                                ※不進版控
logs/               Codex 執行紀錄                                        ※不進版控
archive/            試驗品、檢查腳本                                      ※不進版控
```

## 注意
- Windows 上呼叫 Codex 時固定加 `--enable prefer_mxc`：能用 MXC 沙盒就用，不能用（Windows 10、較舊的 Windows 11）時 Codex 自動退回舊模式。只影響 EMochi 的呼叫，不改 `~/.codex/config.toml`。

- 角色身上若有大面積綠色，把 prompt 的 `#00FF00` 換成 `#FF00FF`，`postprocess.py` 會自動偵測背景色。
- 生圖模型會從精細的角色立繪「順便」學畫法：有畫風參考圖時，建議只勾 1 張角色圖。

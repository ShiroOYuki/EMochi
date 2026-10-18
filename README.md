# AI Sticker

用 Codex CLI 的 `$imagegen` 生成角色貼圖，再自動切割、去背、輸出 Twitch / Discord 需要的尺寸。

- 每套 32 張，分 4 組、每組 8 張（定義在 `config/stickers.json`）
- 每組生成一張 4×2 網格圖，背景純綠 `#00FF00` 方便去背
- 輸出：Twitch 112 / 56 / 28、Discord 128、512 高解析母版

## 環境需求

- Windows（指令以 cmd 為例）
- [uv](https://docs.astral.sh/uv/)：`winget install astral-sh.uv`
- [Codex CLI](https://github.com/openai/codex)（使用 ChatGPT Pro 額度），需在 PATH 中

```cmd
cd /d D:\CODE\Experimental\AI_Sticker
uv sync
```

## 資料夾結構

```
config/
  stickers.json     32 張貼圖的編號、名稱、中文說明、表情 prompt
  styles.json       每種畫風的參考圖與後處理參數
refs/               角色參考圖（ref.png 主設定、ref_tvd.png）
prompts/
  GUIDE.md          prompt 撰寫說明與範本
  <畫風>/g1~g4.txt  每組的生成 prompt，{output} 會自動換成輸出路徑
tools/
  gen.py            呼叫 Codex 生成網格
  process_style.py  網格 → 成品（呼叫 postprocess.py）
  postprocess.py    切割、去背、縮放的核心
  viewer.py         瀏覽、勾選、匯出 zip 的網頁工具
scripts/            雙擊用的 .bat 捷徑
outputs/<畫風>/     grids/（網格原圖）、final/（成品）、previews/（總覽圖）  ※不進版控
exports/            viewer 匯出的 zip 與勾選清單                          ※不進版控
logs/               Codex 執行紀錄                                        ※不進版控
archive/            早期試驗品                                            ※不進版控
```

## 目前的畫風

| 代號 | 說明 | 後處理 |
|---|---|---|
| s1 | Q 版特寫（第一代） | 正方形特寫裁切 |
| s2 | 更可愛的 Q 版 | 正方形特寫裁切 |
| s3 | 像素風 | 正方形特寫裁切 |
| s4 | 麻糬 / 糰子（整顆入鏡） | 不裁切，留白 4% |
| s5 | 賽璐璐動畫截圖風 | 正方形特寫裁切 |

## 流程

### 1. 生成網格

```cmd
uv run tools\gen.py s5              :: 先跑第 1 組，成功後第 2~4 組並行
uv run tools\gen.py s5 -g 3         :: 只重跑第 3 組
uv run tools\gen.py s1 -g single_28 :: 跑 prompts\s1\single_28.txt
uv run tools\gen.py s5 --dry-run    :: 只看會執行什麼
```

第 2~4 組會自動附上同畫風的 `group1` 當參考，讓跨組畫風一致。覆蓋前舊圖會備份到 `outputs\<畫風>\grids\_prev\`。

### 2. 後處理

```cmd
uv run tools\process_style.py s5
```

參數預設讀 `config/styles.json` 的 `process`，命令列可覆蓋（`--square`、`--no-square`、`--margin`）。#28 Lurk 會自動貼齊底邊。

### 3. 檢視與匯出

```cmd
scripts\viewer.bat
```

開啟 http://127.0.0.1:8765 ，可跨畫風比較、勾選、匯出 zip 到 `exports\`。

## 新增一種畫風

1. 複製一個現有資料夾：`xcopy prompts\s5 prompts\s6\ /e`，修改 prompt 裡的畫風描述
2. 在 `config/styles.json` 新增 `s6`，設定參考圖與後處理參數
3. `uv run tools\gen.py s6` → `uv run tools\process_style.py s6`

## 注意

- 角色身上若有大面積綠色，把 prompt 的 `#00FF00` 換成 `#FF00FF`，`postprocess.py` 會自動偵測背景色。
- `outputs/` 不進版控，但 s2~s5 的第 1 組會用到 `outputs/s1/grids/s1_group1.png` 等網格當參考圖，換電腦時記得一起複製 `outputs/`。

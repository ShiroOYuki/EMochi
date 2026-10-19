# 貼圖生成 Prompt（Codex `$imagegen` 用）

> **註**：這份是早期手寫 prompt、用命令列生圖時的說明（那套流程已在 2026-10-19 移除，現在一律用網頁工具，見 `README.md`）。保留作為 prompt 撰寫參考；下方提到的 `group1.png`、`out/` 等是早期單一資料夾時的寫法。

## 使用流程

1. 在一個空資料夾放好角色參考圖，例如 `ref.png`。
2. 用參考圖開 Codex：`codex --image ref.png`
3. **先跑第一組**，確認角色一致、畫風正確後再跑後面三組。
4. 第 2～4 組建議同時附上 `ref.png` 和已經滿意的 `group1.png`，跨組畫風會更一致：
   `codex --image ref.png,group1.png`
5. 四張網格圖都生好後，在同資料夾執行後處理腳本（見最下方）。

> 背景用純綠 `#00FF00`，方便腳本精準去背。如果角色身上有大面積綠色，把所有 prompt 裡的 `#00FF00` 換成 `#FF00FF`（洋紅），腳本會自動偵測背景色。

---

## 共用規則（已包含在下面每組 prompt 裡，不用另外貼）

角色鎖定、4×2 網格、純色背景、寬間距、粗外框、小尺寸可辨識。

---

## 第一組：基礎情緒 → `group1.png`

```
$imagegen Use the attached reference images as the exact character design (ref.png is the main design; ref_tvd.png is an additional reference for the same character). Keep the same face, hair, fox ears, eye color, color palette, outfit and art style. Do not redesign or reinterpret the character.

Create ONE landscape image (3:2) that is an emote sheet of 8 chibi-style emotes in a 4-column x 2-row grid.

Layout rules:
- Each cell contains exactly one emote. Close-up head shot: the head (with ears and hair) fills about 85% of the cell width and most of its height; the neck and collar are cut off by the bottom edge of the cell. No arms or sleeves unless a hand is described, and any described hand stays right next to the face.
- Leave wide empty gutters between cells. Nothing may cross into a neighboring cell.
- Background: one flat solid pure green #00FF00 across the entire image. No gradients, no background shadows, no grid lines, no borders, no frames, no labels.
- No text anywhere except the small symbols explicitly listed below.
- Thick clean outline, bold simple shapes, high contrast, readable even when shrunk to 28x28 pixels.
- Identical line weight, coloring style and lighting across all 8 emotes.

Cells, left to right, top row first:
1. beaming happy smile, eyes curved into happy arcs, ears perked up
2. laughing hard with mouth wide open, tears of laughter at the eye corners
3. sad crying, tears streaming down the cheeks, ears drooping down
4. angry with puffed cheeks, furrowed brows, hair and fur bristling, small anger vein mark
5. shy and blushing, eyes glancing to the side, one hand covering the mouth
6. heart-shaped eyes, blushing cheeks, a few small hearts floating around the head
7. half-closed sleepy eyes, yawning, small "Zzz" floating beside the head
8. smug grin with one eyebrow raised, showing a small fang

Save the result as group1.png in the current folder.
```

## 第二組：反應表情 → `group2.png`

```
$imagegen Use the attached reference images as the exact character design (ref.png is the main design; ref_tvd.png is an additional reference for the same character). Keep the same face, hair, fox ears, eye color, color palette, outfit and art style. Do not redesign or reinterpret the character.

Create ONE landscape image (3:2) that is an emote sheet of 8 chibi-style emotes in a 4-column x 2-row grid.

Layout rules:
- Each cell contains exactly one emote. Close-up head shot: the head (with ears and hair) fills about 85% of the cell width and most of its height; the neck and collar are cut off by the bottom edge of the cell. No arms or sleeves unless a hand is described, and any described hand stays right next to the face.
- Leave wide empty gutters between cells. Nothing may cross into a neighboring cell.
- Background: one flat solid pure green #00FF00 across the entire image. No gradients, no background shadows, no grid lines, no borders, no frames, no labels.
- No text anywhere except the small symbols explicitly listed below.
- Thick clean outline, bold simple shapes, high contrast, readable even when shrunk to 28x28 pixels.
- Identical line weight, coloring style and lighting across all 8 emotes.

Cells, left to right, top row first:
1. shocked, eyes wide open with tiny pupils, mouth open in surprise
2. head tilted in confusion, one eyebrow raised, a small question mark beside the head
3. pouting with puffed cheeks and pursed lips, displeased look
4. big watery sparkling puppy eyes, pleading and aggrieved, ears drooping
5. cheeks stuffed full of food, happily chewing, eyes closed contentedly
6. just got bonked on the head, a small bump on the head, dizzy stars circling, dazed blank expression
7. playful wink with one eye closed, cheeky smile
8. awkward nervous smile, a big sweat drop on the forehead

Save the result as group2.png in the current folder.
```

## 第三組：社群互動 → `group3.png`

```
$imagegen Use the attached reference images as the exact character design (ref.png is the main design; ref_tvd.png is an additional reference for the same character). Keep the same face, hair, fox ears, eye color, color palette, outfit and art style. Do not redesign or reinterpret the character.

Create ONE landscape image (3:2) that is an emote sheet of 8 chibi-style emotes in a 4-column x 2-row grid.

Layout rules:
- Each cell contains exactly one emote. Tight close-up framing: the head (with ears and hair) fills about 75% of the cell width; the body is cut off by the bottom edge of the cell just below the shoulders. Keep described hands and arms compact and close to the face so the head stays large.
- Leave wide empty gutters between cells. Nothing may cross into a neighboring cell.
- Background: one flat solid pure green #00FF00 across the entire image. No gradients, no background shadows, no grid lines, no borders, no frames, no labels.
- No text anywhere.
- Thick clean outline, bold simple shapes, high contrast, readable even when shrunk to 28x28 pixels.
- Identical line weight, coloring style and lighting across all 8 emotes.

Cells, left to right, top row first:
1. cheerful smile, waving one hand beside the face to say hi
2. winking smile, waving one hand goodbye
3. confident smile, making an OK hand sign next to the face
4. serious refusing expression, arms crossed in an X shape in front of the chest
5. happy, both arms stretched open wide asking for a hug (keep the arms inside the cell)
6. eyes closed enjoying a head pat from a hand coming from above, content smile
7. hands pressed together in thanks, grateful smile, sparkling eyes
8. guilty and apologetic, head bowed, eyes teary

Save the result as group3.png in the current folder.
```

## 第四組：Twitch / 迷因 → `group4.png`

```
$imagegen Use the attached reference images as the exact character design (ref.png is the main design; ref_tvd.png is an additional reference for the same character). Keep the same face, hair, fox ears, eye color, color palette, outfit and art style. Do not redesign or reinterpret the character.

Create ONE landscape image (3:2) that is an emote sheet of 8 chibi-style emotes in a 4-column x 2-row grid.

Layout rules:
- Each cell contains exactly one emote. Tight close-up framing: the head (with ears and hair) fills about 75% of the cell width; the body is cut off by the bottom edge of the cell just below the shoulders. Keep described hands and arms compact and close to the face so the head stays large.
- Leave wide empty gutters between cells. Nothing may cross into a neighboring cell.
- Background: one flat solid pure green #00FF00 across the entire image. No gradients, no background shadows, no grid lines, no borders, no frames, no labels.
- No text anywhere.
- Thick clean outline, bold simple shapes, high contrast, readable even when shrunk to 28x28 pixels.
- Identical line weight, coloring style and lighting across all 8 emotes.

Cells, left to right, top row first:
1. hyped and cheering, fists raised, sparkling excited eyes
2. suspicious, eyes narrowed and looking sideways, doubtful expression
3. winking smile, giving a thumbs up
4. peeking up from the bottom edge of the cell, only the top of the head, eyes and ears visible
5. head tilted back howling with mouth open, fox ears standing straight up
6. panicking, both hands holding the head, eyes wide, sweat drops flying
7. facepalm, one hand on the forehead, eyes closed, exasperated
8. dead-fish flat eyes, completely deadpan expressionless face, speechless

Save the result as group4.png in the current folder.
```

---

## 單張重生（某一格不滿意時）

把 `{描述}` 換成 `stickers.json` 裡該張的 `prompt` 欄位，檔名用編號：

```
$imagegen Use the attached reference images as the exact character design and art style (ref.png is the character; group1.png shows the approved emote style). Keep the same face, hair, fox ears, eye color, color palette, outfit, line weight and coloring. Do not redesign the character.

Create ONE square image (1:1) with a single chibi-style emote. Close-up head shot: the head (with ears and hair) fills about 85% of the image width; the neck and collar are cut off by the bottom edge. Small empty margin on the top, left and right only.
Expression: {描述}
Background: flat solid pure green #00FF00, no gradients, no shadows, no borders, no text.
Thick clean outline, bold simple shapes, readable even at 28x28 pixels.

Save the result as single_{編號}.png in the current folder.
```

---

## 後處理

```bash
pip install pillow numpy scipy

# 四張網格一次處理（預設輸出 Twitch 尺寸 112 / 56 / 28）
python postprocess.py group1.png group2.png group3.png group4.png

# 頭部特寫：裁掉下方身體、切口貼齊底邊（Discord / Twitch 28px 更好認，建議 0.75~0.8）
python postprocess.py group1.png group2.png group3.png group4.png --head 0.78

# 單張重生的圖，覆蓋原本那一張（例：第 14 張）
python postprocess.py single_14.png --grid 1x1 --start 14

# 其他平台尺寸，例如 LINE（370x320，留白 10px 左右）
python postprocess.py group*.png --sizes 370x320 --margin 0.03
```

輸出在 `out/`：每個尺寸一個資料夾、`out/master/` 是 512 的高解析版本，另外會產生 `out/preview.png` 棋盤格總覽，方便一眼檢查去背和一致性。

// 後端 API 的資料型別：回應的形狀由後端 app/schemas.py 自動產生（schema.d.ts，npm run gen:api），
// 這裡只取好用的名字；後端改了欄位、重新產生後，前端用錯 TypeScript 會直接報錯
import { fileUrl } from "./client";
import type { components } from "./schema";

type S = components["schemas"];

// ---------- 生成：專案 ----------
export type Project = S["Project"];
export type ProjectStatus = Project["status"];
/** 預覽圖、每一組網格共用的欄位 */
export type GridItem = S["GridItem"];
export type Group = S["Group"];
export type GroupStatus = GridItem["status"];
export type ProjectRefs = S["ProjectRefs"];
export type RefRole = S["TempRef"]["role"];
export type Framing = Project["framing"];
export type ProjectSummary = S["ProjectSummary"];

export const BUSY: ProjectStatus[] = ["expanding", "previewing", "generating", "processing"];

export const STATUS_TEXT: Record<ProjectStatus, string> = {
  expanding: "Codex 擴寫中",
  draft: "草稿",
  previewing: "預覽生成中",
  preview_ready: "預覽完成",
  generating: "貼圖生成中",
  review: "待審核",
  processing: "後處理中",
  done: "已完成",
};

// ---------- 角色庫、畫風庫 ----------
export type CharImage = S["CharImage"];
/** ears：有沒有獸耳；null／沒有＝由後端從特徵句自動判斷 */
export type Character = S["Character"];
/** error 只有「建立並分析」失敗時才會帶 */
export type LibStyle = S["LibStyle"];
export type Importable = S["Importable"];

export const charImageUrl = (c: Character, file: string) =>
  fileUrl(`characters/${c.id}/refs/${file}`, c.updated);
/** 角色這次要用的圖：selected 是 null 時用角色預設勾選的 */
export const charUsed = (c: Character, selected: string[] | null) =>
  c.images.filter((i) => (selected === null ? i.use : selected.includes(i.file))).map((i) => i.file);
export const libImageUrl = (s: LibStyle, file: string) =>
  fileUrl(`style_lib/${s.id}/refs/${file}`, s.updated);
export const libCover = (s: LibStyle) => s.images.find((i) => i.use)?.file ?? s.images[0]?.file;

/** 上傳的圖（前端讀成 data URL 再送）；role 只有專案的暫時參考圖會用到 */
export type Upload = { name: string; data: string; role?: RefRole };

// ---------- 圖庫、匯出 ----------
export type GalleryItem = S["GalleryItem"];
/** character_id：null＝沒指定角色（只靠附圖）的畫風 */
export type GalleryStyle = S["GalleryStyle"];
export type SelectionInfo = S["SelectionInfo"];
export type ExportPreset = S["ExportPreset"];
export type PresetSize = S["PresetSize"];
/** 匯出時的「自訂」：只用這一次，不存成預設集（後端收的是任意 dict，所以這個手寫） */
export type CustomExport = {
  sizes: PresetSize[];
  mode: ExportPreset["mode"];
  margin: number;
  even: boolean;
  max_kb: number | null;
};

// ---------- 表情 ----------
/** name 是檔名用（建立後不變）；deleted＝軟刪除（只有 ?all=1 才拿得到） */
export type Sticker = S["Sticker"];
/** 一個表情可以在好幾組；default＝Gen 新專案預設勾選 */
export type StickerGroup = S["StickerGroupOut"];

// ---------- 設定 ----------
export type DirInfo = S["DirInfo"];
export type DirKey = DirInfo["key"];
export type SettingsValues = S["SettingsValues"];
export type SettingsInfo = S["SettingsInfo"];
export type PathCheck = S["PathCheckResult"];
export type SettingsPlan = S["SettingsPlan"];

// ---------- Codex ----------
/** 時間都是 unix 秒；expired＝重置時間已經過了（以 0% 顯示，下次跑 Codex 才更新） */
export type RateWindow = S["RateWindow"];
/** ChatGPT 方案的額度：primary＝5 小時窗口、secondary＝每週 */
export type CodexUsage = S["CodexUsage"];
export type CodexStatus = S["CodexStatus"];
export type CodexRun = S["CodexRun"];
export type CodexRunResult = CodexRun["result"];
export type CodexTally = S["CodexTally"];

// ---------- 垃圾桶 ----------
export type TrashItem = S["TrashItem"];
export type TrashKind = "projects" | "styles" | "characters" | "stickers";

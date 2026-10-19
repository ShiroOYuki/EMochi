// 後端 API 型別與呼叫

/** 表情；name 是檔名用（建立後不變）；deleted＝軟刪除（只有 ?all=1 才拿得到） */
export type Sticker = {
  id: number; name: string; label: string; zh: string; prompt: string;
  prompt_no_ears?: string; custom?: boolean; align?: string; deleted?: boolean;
};
/** 表情分組（config/sticker_groups.json）：一個表情可以在好幾組；default＝Gen 新專案預設勾選 */
export type StickerGroup = { id: number; name: string; ids: number[]; default: boolean };

export type GroupStatus = "pending" | "running" | "done" | "failed";
export type Group = {
  index: number; ids: number[]; layout: string; prompt: string; image: string;
  status: GroupStatus; message: string; attempts: number; log?: string; tokens?: number | null; started?: string; finished?: string;
};
export type ProjectStatus = "expanding" | "draft" | "previewing" | "preview_ready" | "generating" | "review" | "processing" | "done";
export type Project = {
  id: string; name: string; request: string; style_block: string; framing: "closeup" | "whole";
  process: { square: number | null; margin: number; min_blob: number }; notes_zh: string;
  status: ProjectStatus; error: string | null; created: string; updated: string;
  preview: null | { image: string; ids: number[]; prompt: string; layout: string; status: GroupStatus; message: string; log?: string; started?: string; tokens?: number | null };
  sticker_ids: number[]; groups: Group[]; finished_ids?: number[];
  refs: ProjectRefs; ref_paths: { character: string[]; style: string[]; identity: string };
  style_lib_id?: string | null;
};
export type RefRole = "character" | "style";
export type ProjectRefs = { character_id: string | null; character_images: string[] | null; temp: { file: string; role: RefRole }[] };

export type CharImage = { file: string; use: boolean; source?: string };
/** ears：有沒有獸耳；null／沒填 = 由後端從特徵句自動判斷 */
export type Character = { id: string; name: string; identity: string; notes_zh: string; ears?: boolean | null; images: CharImage[]; created: string; updated: string };
export const charImageUrl = (c: Character, file: string) => fileUrl(`characters/${c.id}/refs/${file}`, c.updated);
/** 角色這次要用的圖：selected 是 null 時用角色預設勾選的 */
export const charUsed = (c: Character, selected: string[] | null) =>
  c.images.filter((i) => (selected === null ? i.use : selected.includes(i.file))).map((i) => i.file);

/** 畫風庫：style_lib/<id>/style.json ＋ refs/；error 只有「建立並分析」失敗時才會帶 */
export type LibStyle = {
  id: string; name: string; request: string; style_block: string; framing: "closeup" | "whole";
  process: { square: number | null; margin: number }; notes_zh: string; images: CharImage[];
  source_project: string | null; created: string; updated: string; error?: string;
};
export const libImageUrl = (s: LibStyle, file: string) => fileUrl(`style_lib/${s.id}/refs/${file}`, s.updated);
export const libCover = (s: LibStyle) => s.images.find((i) => i.use)?.file ?? s.images[0]?.file;
export type Importable = { id: string; name: string; image: string | null; imported: boolean; needs_analyze?: boolean };

export type Upload = { name: string; data: string; role?: RefRole };
/** 瀏覽器端把檔案讀成 data URL（後端再轉成 PNG） */
export const readFiles = (files: Iterable<File>, role?: RefRole): Promise<Upload[]> =>
  Promise.all([...files].filter((f) => f.type.startsWith("image/")).map((f) => new Promise<Upload>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok({ name: f.name || "pasted.png", data: String(r.result), role });
    r.onerror = () => bad(r.error);
    r.readAsDataURL(f);
  })));
export type ProjectSummary = Pick<Project, "id" | "name" | "status" | "updated" | "request"> & { character_id: string | null };

export type GalleryItem = { id: number; name: string; label: string; zh: string; files: Record<string, string>; mtime: number };
/** character_id：null ＝ 沒指定角色（只靠附圖）的畫風 */
export type GalleryStyle = { id: string; name: string; items: GalleryItem[]; character_id: string | null; character_name: string };
export type SelectionInfo = { file: string; count: number; created: string; kind: string; tag: string | null };

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  get: <T,>(url: string) => req<T>("GET", url),
  post: <T,>(url: string, body: unknown = {}) => req<T>("POST", url, body),
  patch: <T,>(url: string, body: unknown) => req<T>("PATCH", url, body),
  put: <T,>(url: string, body: unknown) => req<T>("PUT", url, body),
  del: <T,>(url: string) => req<T>("DELETE", url),
};

/** outputs/、exports/ 底下的檔案網址；v 用來避免瀏覽器快取舊圖 */
export const fileUrl = (path: string, v?: string | number) => `/files/${path}${v ? `?v=${encodeURIComponent(String(v))}` : ""}`;

export const BUSY: ProjectStatus[] = ["expanding", "previewing", "generating", "processing"];

export const STATUS_TEXT: Record<ProjectStatus, string> = {
  expanding: "Codex 擴寫中", draft: "草稿", previewing: "預覽生成中", preview_ready: "預覽完成",
  generating: "貼圖生成中", review: "待審核", processing: "後處理中", done: "已完成",
};

/** Codex 額度（ChatGPT 方案）：primary＝5 小時窗口、secondary＝每週窗口；時間都是 unix 秒 */
/** expired：記錄裡的重置時間已經過了（用量以 0% 顯示，下次跑 Codex 才會拿到新數字） */
export type RateWindow = { used_percent: number; window_minutes: number | null; resets_at: number | null; expired?: boolean };
export type CodexUsage = {
  available: boolean; primary: RateWindow | null; secondary: RateWindow | null;
  plan_type: string | null; updated: number | null; now: number; message: string;
};

/** 設定頁（/api/settings） */
export type DirKey = "logs_dir" | "config_dir" | "exports_dir" | "characters_dir" | "style_lib_dir";
export type DirInfo = { key: DirKey; label: string; desc: string; value: string; default: string; path: string; exists: boolean; files: number; size: number };
export type SettingsValues = { max_parallel: number; default_layout: "4x2w" | "3x2"; image_timeout_min: number; text_timeout_min: number; codex_args: string[]; theme: "system" | "light" | "dark" };
export type SettingsInfo = {
  dirs: DirInfo[]; values: SettingsValues; defaults: SettingsValues; limits: Record<string, [number, number]>;
  layouts: string[]; settings_file: string; root: string; busy: string | null; codex_command: string[];
  report?: { moved: { key: DirKey; moved: number; skipped: number }[]; projects_updated: number };
};
export type PathCheck = { key: DirKey; value: string; path: string; exists: boolean; files: number; size: number; error: string | null; warn: string | null };
export type SettingsPlan = {
  dirs: { key: DirKey; label: string; from: string; to: string; files: number; size: number; conflicts: string[]; conflict_count: number }[];
  errors: string[]; busy: string | null;
};

/** Codex 狀態對話框（/api/codex-status） */
export type CodexRunResult = "ok" | "failed" | "timeout" | "running" | "unknown";
export type CodexRun = { time: string; date: string; scope: string; scope_label: string; name: string; kind: string; tokens: number | null; seconds: number | null; result: CodexRunResult; log: string };
export type CodexTally = { key: string; label: string; tokens: number; runs: number };
export type CodexStatus = {
  cli: { found: boolean; path?: string | null; version?: string | null; error?: string };
  login: { ok: boolean; text: string; pending: boolean };
  checked_at?: number; rate: CodexUsage; sessions_dir: string; sessions_found: boolean;
  running: { scope: string; scope_label: string; kind: string; name: string; seconds: number }[];
  usage: {
    days: number; daily: { date: string; tokens: number; runs: number; by_kind: Record<string, number> }[];
    by_kind: CodexTally[]; by_scope: CodexTally[]; total_tokens: number; runs: number; failed: number;
    avg_grid_tokens: number | null; recent: CodexRun[];
  };
};

/** 垃圾桶（<root>/_removed/）裡的項目；name 是資料夾名 <id>_<刪除時間>；thumb 是可用 fileUrl 顯示的縮圖 */
export type TrashKind = "projects" | "styles" | "characters";
export type TrashItem = {
  name: string; id: string; title: string; status: ProjectStatus | null; removed: string; size: number;
  thumb: string | null; restorable: boolean;
};

/** 匯出預設集（app/presets.py）：一組平台規格＝尺寸、縮放方式、邊距、大小上限、檔名方式 */
export type PresetSize = { w: number; h: number };
export type ExportPreset = {
  id: string; name: string; folder: string; sizes: PresetSize[];
  /** fit：等比縮進框內；canvas：剛好寬×高的透明畫布，置中 */
  mode: "fit" | "canvas";
  margin: number; even: boolean;
  /** 每個檔案的上限（KB）；null＝不限 */
  max_kb: number | null;
  /** keep：01_happy_s6.png；index：01.png、02.png…（LINE） */
  naming: "keep" | "index";
  note: string;
};
/** 匯出時的「自訂」：只用這一次，不存成預設集 */
export type CustomExport = { sizes: PresetSize[]; mode: "fit" | "canvas"; margin: number; even: boolean; max_kb: number | null };

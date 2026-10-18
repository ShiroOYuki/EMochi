// 後端 API 型別與呼叫

export type Sticker = { id: number; group: number; name: string; label: string; zh: string; prompt: string; custom?: boolean; align?: string };

export type GroupStatus = "pending" | "running" | "done" | "failed";
export type Group = {
  index: number; ids: number[]; layout: string; prompt: string; image: string;
  status: GroupStatus; message: string; attempts: number; log?: string; started?: string; finished?: string;
};
export type ProjectStatus = "expanding" | "draft" | "previewing" | "preview_ready" | "generating" | "review" | "processing" | "done";
export type Project = {
  id: string; name: string; request: string; style_block: string; framing: "closeup" | "whole";
  process: { square: number | null; margin: number; min_blob: number }; notes_zh: string;
  status: ProjectStatus; error: string | null; created: string; updated: string;
  preview: null | { image: string; ids: number[]; prompt: string; layout: string; status: GroupStatus; message: string; log?: string; started?: string };
  sticker_ids: number[]; groups: Group[]; finished_ids?: number[];
  refs: ProjectRefs; ref_paths: { character: string[]; style: string[]; identity: string };
};
export type RefRole = "character" | "style";
export type ProjectRefs = { character_id: string | null; character_images: string[] | null; temp: { file: string; role: RefRole }[] };

export type CharImage = { file: string; use: boolean };
export type Character = { id: string; name: string; identity: string; notes_zh: string; images: CharImage[]; created: string; updated: string };
export const charImageUrl = (c: Character, file: string) => fileUrl(`characters/${c.id}/refs/${file}`, c.updated);
/** 角色這次要用的圖：selected 是 null 時用角色預設勾選的 */
export const charUsed = (c: Character, selected: string[] | null) =>
  c.images.filter((i) => (selected === null ? i.use : selected.includes(i.file))).map((i) => i.file);

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

export type GalleryItem = { id: number; name: string; label: string; zh: string; group: number; files: Record<string, string>; mtime: number };
export type GalleryStyle = { id: string; name: string; items: GalleryItem[] };
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
  del: <T,>(url: string) => req<T>("DELETE", url),
};

/** outputs/、exports/ 底下的檔案網址；v 用來避免瀏覽器快取舊圖 */
export const fileUrl = (path: string, v?: string | number) => `/files/${path}${v ? `?v=${encodeURIComponent(String(v))}` : ""}`;

export const BUSY: ProjectStatus[] = ["expanding", "previewing", "generating", "processing"];

export const STATUS_TEXT: Record<ProjectStatus, string> = {
  expanding: "Codex 擴寫中", draft: "草稿", previewing: "預覽生成中", preview_ready: "預覽完成",
  generating: "貼圖生成中", review: "待審核", processing: "後處理中", done: "已完成",
};

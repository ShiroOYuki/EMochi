// 生成頁：畫風專案（app/routes/projects.py）
import { http } from "./client";
import type { Framing, LibStyle, Project, ProjectSummary, RefRole, Upload } from "./types";

const enc = encodeURIComponent;
const base = (id: string) => `/api/projects/${id}`;

/** GET /api/projects：專案清單＋生成頁需要的設定 */
export type ProjectList = {
  projects: ProjectSummary[];
  next_id: string;
  preview_ids: number[];
  max_parallel: number;
  default_layout?: GroupLayout;
};
export type GroupLayout = "4x2w" | "3x2";

export type CreateProjectBody = {
  request: string;
  character_id: string | null;
  /** null＝用角色庫預設勾選的圖；[]＝一張都不用 */
  character_images: string[] | null;
  temp_refs: Upload[];
  style_lib_id: string | null;
};
export type ProjectPatch = Partial<{
  name: string;
  request: string;
  framing: Framing;
  style_block: string;
  process: { square: number | null; margin: number };
  character_id: string | null;
  character_images: string[] | null;
}>;
/** 預覽圖或第幾組 */
export type GridTarget = "preview" | number;

export const projectsApi = {
  list: () => http.get<ProjectList>("/api/projects"),
  get: (id: string) => http.get<Project>(base(id)),
  create: (body: CreateProjectBody) => http.post<Project>("/api/projects", body),
  update: (id: string, patch: ProjectPatch) => http.patch<Project>(base(id), patch),
  /** 移到垃圾桶 */
  remove: (id: string) => http.del(base(id)),

  expand: (id: string, request: string) => http.post<Project>(`${base(id)}/expand`, { request }),
  preview: (id: string) => http.post<Project>(`${base(id)}/preview`),
  generate: (id: string, ids: number[], layout: GroupLayout) =>
    http.post<Project>(`${base(id)}/generate`, { ids, layout }),
  regenerate: (id: string, group: number) => http.post<Project>(`${base(id)}/groups/${group}/regenerate`),
  recheck: (id: string, target: GridTarget) => http.post<Project>(`${base(id)}/recheck/${target}`),
  accept: (id: string, target: GridTarget) => http.post<Project>(`${base(id)}/accept/${target}`),
  finalize: (id: string) => http.post<Project>(`${base(id)}/finalize`),
  reopen: (id: string) => http.post<Project>(`${base(id)}/reopen`),
  toLibrary: (id: string) => http.post<LibStyle>(`${base(id)}/to-library`),

  addRefs: (id: string, uploads: Upload[]) => http.post<Project>(`${base(id)}/refs`, uploads),
  setRefRole: (id: string, file: string, role: RefRole) =>
    http.patch<Project>(`${base(id)}/refs/${enc(file)}`, { role }),
  removeRef: (id: string, file: string) =>
    http.patch<Project>(`${base(id)}/refs/${enc(file)}`, { remove: true }),

  /** 目前描述組出來、實際送給 Codex 的 prompt */
  prompt: async (id: string) => (await http.get<{ prompt: string }>(`${base(id)}/prompt`)).prompt,
  /** Codex 紀錄檔內容（path 是 project.json 裡記的 log 路徑） */
  log: async (id: string, path: string) =>
    (await http.get<{ text: string }>(`${base(id)}/log?path=${enc(path)}`)).text,
};

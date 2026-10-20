// 角色庫（/api/characters）、畫風庫（/api/style-lib）：兩邊共用同一套清單／參考圖操作（app/reflib.py）
import { http } from "./client";
import type { Character, Framing, Importable, LibStyle, Upload } from "./types";

const enc = encodeURIComponent;

/** 角色庫、畫風庫共用的操作；useLibrary、RefImageGrid 吃這個 */
export function refLibraryApi<T>(endpoint: string) {
  const one = (id: string) => `${endpoint}/${id}`;
  return {
    /** TanStack Query 的 key（api/queries.ts） */
    key: [endpoint] as const,
    list: () => http.get<T[]>(endpoint),
    /** 移到垃圾桶 */
    remove: (id: string) => http.del(one(id)),
    addImages: (id: string, uploads: Upload[]) => http.post<T>(`${one(id)}/images`, uploads),
    removeImage: (id: string, file: string) => http.del<T>(`${one(id)}/images/${enc(file)}`),
    /** 參考圖預設要不要用 */
    setImageUse: (id: string, file: string, use: boolean) => http.patch<T>(one(id), { use: { [file]: use } }),
  };
}
export type RefLibraryApi<T> = ReturnType<typeof refLibraryApi<T>>;

export type CharacterPatch = Partial<{ name: string; identity: string; ears: boolean | null }>;

export const charactersApi = {
  ...refLibraryApi<Character>("/api/characters"),
  create: (name: string, images: Upload[]) => http.post<Character>("/api/characters", { name, images }),
  update: (id: string, patch: CharacterPatch) => http.patch<Character>(`/api/characters/${id}`, patch),
  /** Codex 看圖寫角色特徵 */
  describe: (id: string) => http.post<Character>(`/api/characters/${id}/describe`),
};

export type NewLibStyleBody = { name: string; request: string; images: Upload[]; analyze: boolean };
export type LibStylePatch = Partial<{
  name: string;
  request: string;
  framing: Framing;
  style_block: string;
  process: { square: number | null; margin: number };
}>;

export const styleLibApi = {
  ...refLibraryApi<LibStyle>("/api/style-lib"),
  create: (body: NewLibStyleBody) => http.post<LibStyle>("/api/style-lib", body),
  update: (id: string, patch: LibStylePatch) => http.patch<LibStyle>(`/api/style-lib/${id}`, patch),
  /** 可以從完成的專案匯入的畫風 */
  importable: () => http.get<Importable[]>("/api/style-lib/importable"),
  importProject: (project: string) => http.post<LibStyle>("/api/style-lib/import", { project }),
  /** Codex 分析參考圖寫畫風描述；request 是使用者補充的中文說明 */
  analyze: (id: string, request: string) => http.post<LibStyle>(`/api/style-lib/${id}/analyze`, { request }),
};

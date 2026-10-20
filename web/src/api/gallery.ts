// 圖庫、匯出、勾選清單、匯出預設集（app/routes/gallery.py）
import { http } from "./client";
import type { CustomExport, ExportPreset, GalleryStyle, SelectionInfo } from "./types";

/** 總覽圖（把勾選的貼圖排成一張）設定 */
export type CombineOptions = { cols: number; cell: number; gap: number; bg: string; labels: boolean };
export type ExportResult = { file: string; count: number; issues: { file: string; notes: string[] }[] };
export type PresetState = { presets: ExportPreset[]; custom: boolean };

export const galleryApi = {
  list: () => http.get<GalleryStyle[]>("/api/gallery"),
  /** keys：「畫風id:貼圖id」；tag 會加在 zip 檔名 */
  export: (body: { keys: string[]; presets: string[]; custom: CustomExport | null; tag: string }) =>
    http.post<ExportResult>("/api/gallery/export", body),
  combine: (keys: string[], opts: CombineOptions) =>
    http.post<{ file: string }>("/api/gallery/combine", { keys, ...opts }),

  selections: () => http.get<SelectionInfo[]>("/api/gallery/selections"),
  /** 讀回存過的勾選清單；舊版檔案的欄位不一定齊，呼叫端自己檢查 */
  selection: (file: string) =>
    http.get<Record<string, unknown>>(`/api/gallery/selections/${encodeURIComponent(file)}`),
  saveSelection: (body: {
    keys: string[];
    presets: string[];
    custom: CustomExport | null;
    combine: CombineOptions;
    tag: string;
  }) => http.post<{ file: string }>("/api/gallery/selections", body),
};

export const exportPresetsApi = {
  get: () => http.get<PresetState>("/api/export-presets"),
  save: (presets: ExportPreset[]) => http.put<PresetState>("/api/export-presets", { presets }),
  reset: () => http.post<PresetState>("/api/export-presets/reset", {}),
};

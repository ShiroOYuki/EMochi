// 設定頁（app/routes/settings.py）與介面偏好（/api/ui-prefs）
import { http } from "./client";
import type { DirKey, PathCheck, SettingsInfo, SettingsPlan, SettingsValues } from "./types";

/** 要改的資料夾（完整路徑）與數值設定 */
export type SettingsChanges = Partial<Record<DirKey, string>> & Partial<SettingsValues>;
/** 新位置已有同名檔：keep＝保留新位置的、overwrite＝覆蓋；null＝沒有衝突 */
export type ConflictPolicy = "keep" | "overwrite" | null;

export const settingsApi = {
  get: () => http.get<SettingsInfo>("/api/settings"),
  /** 輸入路徑時即時檢查；others 是其他資料夾目前填的值（檢查重疊用） */
  checkPath: (key: DirKey, value: string, others: Record<string, string>) =>
    http.post<PathCheck>("/api/settings/check", { key, value, others }),
  /** 套用前先算要搬哪些檔、有沒有衝突 */
  plan: (changes: SettingsChanges) => http.post<SettingsPlan>("/api/settings/plan", { changes }),
  apply: (changes: SettingsChanges, move: boolean, conflict: ConflictPolicy) =>
    http.put<SettingsInfo>("/api/settings", { changes, move, conflict }),
  /** 網頁版：在伺服器那台電腦跳出選資料夾視窗；取消回傳 null */
  pickFolder: async (start: string) =>
    (await http.post<{ path: string | null }>("/api/settings/pick-folder", { path: start })).path,
  openFolder: (path: string) => http.post("/api/settings/open-folder", { path }),
};

export type ThemePref = "system" | "light" | "dark";
/** settings.local.json 裡跟介面有關的偏好；stored＝主題是否存過（沒存過才搬瀏覽器舊值） */
export type UiPrefs = { theme: ThemePref; stored: boolean; tour_done?: boolean; notify?: boolean };

export const uiPrefsApi = {
  get: () => http.get<UiPrefs>("/api/ui-prefs"),
  set: (prefs: Partial<{ theme: ThemePref; tour_done: boolean; notify: boolean }>) =>
    http.put("/api/ui-prefs", prefs),
};

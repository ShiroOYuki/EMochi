// Codex 狀態與額度、通知事件、診斷資訊、垃圾桶（app/routes/system.py、projects.py 的 trash）
import { http } from "./client";
import type { components } from "./schema";
import type { CodexStatus, CodexUsage, TrashItem, TrashKind } from "./types";

type S = components["schemas"];

const refresh = (force: boolean) => (force ? "?refresh=1" : "");
const enc = encodeURIComponent;

/** 啟動時的 Codex 檢查（CLI 找不找得到、登入了沒） */
export type CodexCheck = S["CodexCheck"];

export const codexApi = {
  check: (force = false) => http.get<CodexCheck>(`/api/codex-check${refresh(force)}`),
  status: (force = false) => http.get<CodexStatus>(`/api/codex-status${refresh(force)}`),
  usage: (force = false) => http.get<CodexUsage>(`/api/codex-usage${refresh(force)}`),
  /** 開瀏覽器登入；回傳給使用者看的說明 */
  login: async () => (await http.post<S["LoginStarted"]>("/api/codex-login")).message,
};

/** 桌面通知事件（app/events.py） */
export type AppEvent = S["AppEvent"];
export type EventsResp = S["EventsResp"];

/** 回報問題用的診斷資訊；text 是整份可複製的純文字 */
export type Diagnostics = S["Diagnostics"];

export const systemApi = {
  /** after＜0 或 boot 對不上：只回目前的 seq，不補發舊事件 */
  events: (after: number, boot: string) =>
    http.get<EventsResp>(`/api/events?after=${after}&boot=${enc(boot)}`),
  diagnostics: (desktopVersion?: string) =>
    http.get<Diagnostics>(
      `/api/diagnostics?desktop=${desktopVersion ? 1 : 0}${desktopVersion ? `&app_version=${enc(desktopVersion)}` : ""}`,
    ),
  logsDir: async () => (await http.get<{ path: string }>("/api/logs-dir")).path,
};

export const trashApi = {
  list: (kind: TrashKind) => http.get<TrashItem[]>(`/api/trash/${kind}`),
  restore: (kind: TrashKind, name: string) => http.post(`/api/trash/${kind}/${enc(name)}/restore`),
  /** 永久刪除一筆 */
  purge: (kind: TrashKind, name: string) => http.del(`/api/trash/${kind}/${enc(name)}`),
  /** 清空這一類 */
  empty: (kind: TrashKind) => http.del(`/api/trash/${kind}`),
};

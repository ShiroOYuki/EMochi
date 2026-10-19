// 匯出預設集的共用狀態：圖庫的匯出面板、預設集管理視窗（從匯出面板或設定頁打開）看到的是同一份
import { useEffect, useSyncExternalStore } from "react";
import { api, type ExportPreset, type PresetSize } from "./api";

type State = { presets: ExportPreset[]; custom: boolean; loaded: boolean };
let state: State = { presets: [], custom: false, loaded: false };
const subs = new Set<() => void>();
const set = (s: Omit<State, "loaded">) => { state = { ...s, loaded: true }; subs.forEach((f) => f()); };

export async function reloadPresets() {
  set(await api.get<Omit<State, "loaded">>("/api/export-presets"));
}

/** 整份存回去；驗證失敗會丟錯（訊息直接給使用者看） */
export async function savePresets(presets: ExportPreset[]) {
  set(await api.put<Omit<State, "loaded">>("/api/export-presets", { presets }));
}

export async function resetPresets() {
  set(await api.post<Omit<State, "loaded">>("/api/export-presets/reset", {}));
}

export function usePresets() {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
  useEffect(() => { if (!state.loaded) reloadPresets().catch(() => {}); }, []);
  return s;
}

/** 112×112 → 112；其他 寬×高 */
export const sizeText = (s: PresetSize) => (s.w === s.h ? `${s.w}` : `${s.w}×${s.h}`);

/** 「256, 300x200」→ [{256,256}, {300,200}]；格式不對回傳 null */
export function parseSizes(text: string): PresetSize[] | null {
  const parts = text.split(/[,，、\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out: PresetSize[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{1,4})(?:\s*[x×*]\s*(\d{1,4}))?$/i);
    if (!m) return null;
    const w = +m[1], h = m[2] ? +m[2] : w;
    if (w < 8 || h < 8 || w > 2048 || h > 2048) return null;
    out.push({ w, h });
  }
  return out;
}

/** 舊版匯出格式代號（存在舊的勾選清單、localStorage）→ 預設集 id */
export function legacyToPresets(fmts: string[]): string[] {
  const map: Record<string, string> = { t112: "twitch", t56: "twitch", t28: "twitch", discord: "discord", master: "master" };
  return [...new Set(fmts.map((f) => map[f]).filter(Boolean))];
}

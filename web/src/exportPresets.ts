// 匯出預設集：圖庫的匯出面板、預設集管理視窗（從匯出面板或設定頁打開）看到的是同一份（TanStack Query 快取）
import { useQuery } from "@tanstack/react-query";
import { exportPresetsApi, keys, queryClient, type ExportPreset, type PresetSize } from "./api";

const NONE: ExportPreset[] = [];

/** 整份存回去；驗證失敗會丟錯（訊息直接給使用者看） */
export async function savePresets(presets: ExportPreset[]) {
  queryClient.setQueryData(keys.exportPresets, await exportPresetsApi.save(presets));
}

export async function resetPresets() {
  queryClient.setQueryData(keys.exportPresets, await exportPresetsApi.reset());
}

/** presets：目前的預設集；custom：使用者改過（不是內建的那份）；loaded：載入完成 */
export function usePresets() {
  const q = useQuery({ queryKey: keys.exportPresets, queryFn: exportPresetsApi.get });
  return { presets: q.data?.presets ?? NONE, custom: q.data?.custom ?? false, loaded: q.isSuccess };
}

export const OTHER_GROUP = "其他";

/** 依分組排：分組照第一次出現的順序，沒有分組的（「其他」）放最後；組內維持原順序 */
export function groupPresets<T extends { group: string }>(items: T[]): { group: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const p of items) {
    const g = p.group.trim() || OTHER_GROUP;
    map.set(g, [...(map.get(g) ?? []), p]);
  }
  const out = [...map.entries()].map(([group, items]) => ({ group, items }));
  return [...out.filter((x) => x.group !== OTHER_GROUP), ...out.filter((x) => x.group === OTHER_GROUP)];
}

/** 112×112 → 112；其他 寬×高 */
export const sizeText = (s: PresetSize) => (s.w === s.h ? `${s.w}` : `${s.w}×${s.h}`);

/** 「256, 300x200」→ [{256,256}, {300,200}]；格式不對回傳 null */
export function parseSizes(text: string): PresetSize[] | null {
  const parts = text
    .split(/[,，、\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: PresetSize[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{1,4})(?:\s*[x×*]\s*(\d{1,4}))?$/i);
    if (!m) return null;
    const w = +m[1],
      h = m[2] ? +m[2] : w;
    if (w < 8 || h < 8 || w > 2048 || h > 2048) return null;
    out.push({ w, h });
  }
  return out;
}

/** 舊版匯出格式代號（存在舊的勾選清單、localStorage）→ 預設集 id */
export function legacyToPresets(fmts: string[]): string[] {
  const map: Record<string, string> = {
    t112: "twitch",
    t56: "twitch",
    t28: "twitch",
    discord: "discord",
    master: "master",
  };
  return [...new Set(fmts.map((f) => map[f]).filter(Boolean))];
}

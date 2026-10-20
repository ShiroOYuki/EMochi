// 表情清單與分組的共用狀態：「表情」分頁編輯、Gen 頁面挑選，兩邊看到的是同一份
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api, type Sticker, type StickerGroup } from "./api";

type State = { all: Sticker[]; groups: StickerGroup[]; loaded: boolean };
let state: State = { all: [], groups: [], loaded: false };
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

let loading: Promise<void> | null = null;
/** 重抓表情（含已刪除）與分組 */
export function reloadStickers(): Promise<void> {
  loading ??= Promise.all([
    api.get<Sticker[]>("/api/stickers?all=1"),
    api.get<StickerGroup[]>("/api/sticker-groups"),
  ])
    .then(([all, groups]) => set({ all, groups, loaded: true }))
    .finally(() => {
      loading = null;
    });
  return loading;
}

let seq = 0;
/** 分組整份存回去：畫面先更新（拖拉要即時），失敗就退回原本的；連續拖好幾次時只採用最後一次的回應 */
export async function saveGroups(groups: StickerGroup[]): Promise<void> {
  const prev = state.groups;
  const my = ++seq;
  set({ groups });
  try {
    const saved = await api.put<StickerGroup[]>("/api/sticker-groups", groups);
    if (my === seq) set({ groups: saved });
  } catch (e) {
    if (my === seq) set({ groups: prev });
    throw e;
  }
}

export function useStickers() {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (!state.loaded) reloadStickers().catch(() => {});
  }, []);
  return useMemo(() => {
    const active = s.all.filter((x) => !x.deleted);
    const byId = new Map(s.all.map((x) => [x.id, x]));
    const grouped = new Set(s.groups.flatMap((g) => g.ids));
    return {
      ...s,
      active,
      byId,
      deleted: s.all.filter((x) => x.deleted),
      ungrouped: active.filter((x) => !grouped.has(x.id)),
      /** Gen 新專案預設勾選的表情（default 分組的聯集，依 id 排序） */
      defaults: [...new Set(s.groups.filter((g) => g.default).flatMap((g) => g.ids))].sort((a, b) => a - b),
    };
  }, [s]);
}

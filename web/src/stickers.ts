// 表情清單與分組的共用狀態：「表情」分頁編輯、Gen 頁面挑選，兩邊看到的是同一份
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { stickersApi, type Sticker, type StickerGroup } from "./api";

type State = { all: Sticker[]; groups: StickerGroup[]; loaded: boolean };
let state: State = { all: [], groups: [], loaded: false };
/** 目前的狀態快照（元件請用 useStickers；這個給測試和非 React 程式碼） */
export const getStickerState = () => state;
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
  loading ??= Promise.all([stickersApi.listAll(), stickersApi.groups()])
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
    const saved = await stickersApi.saveGroups(groups);
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
  return useMemo(() => ({ ...s, ...deriveStickers(s.all, s.groups) }), [s]);
}

/** 從表情清單與分組算出各頁要用的衍生資料（純函式，stickers.test.ts 有測） */
export function deriveStickers(all: Sticker[], groups: StickerGroup[]) {
  const active = all.filter((x) => !x.deleted);
  const grouped = new Set(groups.flatMap((g) => g.ids));
  return {
    active,
    byId: new Map(all.map((x) => [x.id, x])),
    deleted: all.filter((x) => x.deleted),
    /** 沒有在任何分組裡的（不含已刪除） */
    ungrouped: active.filter((x) => !grouped.has(x.id)),
    /** Gen 新專案預設勾選的表情（default 分組的聯集，依 id 排序） */
    defaults: [...new Set(groups.filter((g) => g.default).flatMap((g) => g.ids))].sort((a, b) => a - b),
  };
}

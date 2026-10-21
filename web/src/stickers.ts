// 表情清單與分組：「表情」分頁編輯、Gen 挑選、圖庫篩選看到的是同一份（TanStack Query 快取，api/queries.ts）
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { invalidate, keys, queryClient, stickersApi, type Sticker, type StickerGroup } from "./api";

const NONE: never[] = []; // 還沒載入時用同一個空陣列，useMemo 才不會每次重算

/** 重抓表情（含已刪除）與分組 */
export const reloadStickers = () => invalidate(keys.stickers, keys.stickerGroups).then(() => {});

/** 目前快取裡的資料（元件請用 useStickers；這個給測試和非 React 程式碼） */
export const getStickerState = () => ({
  all: queryClient.getQueryData<Sticker[]>(keys.stickers) ?? NONE,
  groups: queryClient.getQueryData<StickerGroup[]>(keys.stickerGroups) ?? NONE,
});

let seq = 0;
/** 分組整份存回去：畫面先更新（拖拉要即時），失敗就退回原本的；連續拖好幾次時只採用最後一次的回應 */
export async function saveGroups(groups: StickerGroup[]): Promise<void> {
  void queryClient.cancelQueries({ queryKey: keys.stickerGroups }); // 進行中的重抓不要蓋掉這次的改動
  const prev = getStickerState().groups;
  const my = ++seq;
  queryClient.setQueryData(keys.stickerGroups, groups);
  try {
    const saved = await stickersApi.saveGroups(groups);
    if (my === seq) queryClient.setQueryData(keys.stickerGroups, saved);
  } catch (e) {
    if (my === seq) queryClient.setQueryData(keys.stickerGroups, prev);
    throw e;
  }
}

export function useStickers() {
  const stickers = useQuery({ queryKey: keys.stickers, queryFn: stickersApi.listAll });
  const groupsQuery = useQuery({ queryKey: keys.stickerGroups, queryFn: stickersApi.groups });
  const all = stickers.data ?? NONE;
  const groups = groupsQuery.data ?? NONE;
  const loaded = stickers.isSuccess && groupsQuery.isSuccess;
  return useMemo(() => ({ all, groups, loaded, ...deriveStickers(all, groups) }), [all, groups, loaded]);
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

import { useEffect, useMemo, useState } from "react";
import type { GalleryItem, GalleryStyle } from "../../api";
import { useStored } from "../../hooks/useStored";
import { useStickers } from "../../stickers";
import type { Entry } from "./shared";

/** 畫風下拉：並排比較所有畫風（其他值＝單一畫風 id） */
export const COMPARE_ALL = "__all";
/** 角色下拉：全部角色／沒指定角色的畫風（其他值＝角色 id） */
export const ALL_CHARACTERS = "__all";
export const NO_CHARACTER = "__none";
/** 組別下拉（用「表情」分頁的分組）：全部／不在任何分組（其他值＝分組 id） */
export const ALL_GROUPS = 0;
export const UNGROUPED = -1;

export type CompareRow = { id: number; entries: Entry[] };

/** 角色、畫風、組別三個篩選，以及篩選後要顯示的卡片：
 *  view＝依顯示順序的所有卡片（大圖左右切換用）；rows＝並排比較時依表情編號分組，單一畫風時是 null */
export function useGalleryFilters(allStyles: GalleryStyle[]) {
  const [mode, setMode] = useStored<string>("gallery.mode", COMPARE_ALL);
  const [characterFilter, setCharacterFilter] = useStored<string>("gallery.char", ALL_CHARACTERS);
  const { groups: stickerGroups } = useStickers();
  const [group, setGroup] = useState(ALL_GROUPS);

  const characterOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();
    for (const s of allStyles) {
      const id = s.character_id ?? NO_CHARACTER;
      const opt = byId.get(id) ?? {
        id,
        name: s.character_id ? s.character_name || s.character_id : "未指定角色",
        count: 0,
      };
      opt.count += 1;
      byId.set(id, opt);
    }
    return [...byId.values()];
  }, [allStyles]);

  const styles = useMemo(
    () =>
      characterFilter === ALL_CHARACTERS
        ? allStyles
        : allStyles.filter((s) => (s.character_id ?? NO_CHARACTER) === characterFilter),
    [allStyles, characterFilter],
  );
  // 換了角色、原本選的畫風不在清單裡 → 回到並排比較
  useEffect(() => {
    if (mode !== COMPARE_ALL && allStyles.length && !styles.some((s) => s.id === mode)) setMode(COMPARE_ALL);
  }, [styles, allStyles.length, mode, setMode]);
  // 選的分組被刪掉了 → 回到全部
  useEffect(() => {
    if (group > 0 && !stickerGroups.some((g) => g.id === group)) setGroup(ALL_GROUPS);
  }, [stickerGroups, group]);

  const { view, rows } = useMemo(() => {
    let inGroup: ((it: GalleryItem) => boolean) | null = null;
    if (group === UNGROUPED) {
      const grouped = new Set(stickerGroups.flatMap((g) => g.ids));
      inGroup = (it) => !grouped.has(it.id);
    } else if (group !== ALL_GROUPS) {
      const ids = new Set(stickerGroups.find((g) => g.id === group)?.ids ?? []);
      inGroup = (it) => ids.has(it.id);
    }
    const shown = (it: GalleryItem) => !inGroup || inGroup(it);

    if (mode !== COMPARE_ALL) {
      const s = styles.find((x) => x.id === mode) ?? styles[0];
      const entries: Entry[] = s ? s.items.filter(shown).map((it) => ({ s, it })) : [];
      return { view: entries, rows: null as CompareRow[] | null };
    }
    const ids = [...new Set(styles.flatMap((s) => s.items.filter(shown).map((i) => i.id)))].sort(
      (a, b) => a - b,
    );
    const compareRows: CompareRow[] = ids.map((id) => ({
      id,
      entries: styles.flatMap((s) => {
        const it = s.items.find((x) => x.id === id);
        return it ? [{ s, it }] : [];
      }),
    }));
    return { view: compareRows.flatMap((r) => r.entries), rows: compareRows };
  }, [styles, mode, group, stickerGroups]);

  return {
    mode,
    setMode,
    characterFilter,
    setCharacterFilter,
    characterOptions,
    group,
    setGroup,
    stickerGroups,
    styles,
    view,
    rows,
  };
}

import type { GalleryItem, GalleryStyle } from "../../api";

/** 圖庫裡的一張：哪套畫風（s）的哪個表情（it） */
export type Entry = { s: GalleryStyle; it: GalleryItem };
/** 勾選清單用的 key：「畫風id:表情id」（後端匯出也吃這個格式） */
export const keyOf = (e: Entry) => `${e.s.id}:${e.it.id}`;

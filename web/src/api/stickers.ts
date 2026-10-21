// 表情與分組（app/routes/stickers.py）
import { http } from "./client";
import type { Body } from "./requests";
import type { components } from "./schema";
import type { Sticker, StickerGroup } from "./types";

/** align："bottom"＝切圖時貼齊底部；null＝置中 */
export type StickerBody = Omit<Body<"NewSticker">, "group_id">;
/** Codex 擴寫的結果（填進表單，存不存由使用者決定） */
export type StickerDraft = components["schemas"]["StickerDraft"];

export const stickersApi = {
  /** 含已刪除（deleted: true）的，舊專案的組別還要顯示名稱 */
  listAll: () => http.get<Sticker[]>("/api/stickers?all=1"),
  create: (body: Body<"NewSticker">) => http.post<Sticker>("/api/stickers", body),
  update: (id: number, body: Body<"StickerPatch">) => http.patch<Sticker>(`/api/stickers/${id}`, body),
  /** 軟刪除，可以還原 */
  remove: (id: number) => http.del(`/api/stickers/${id}`),
  restore: (id: number) => http.post(`/api/stickers/${id}/restore`),
  /** Codex 把一句中文想法擴寫成表情的名稱與 prompt */
  expand: (body: Body<"ExpandSticker">) => http.post<StickerDraft>("/api/stickers/expand", body),

  groups: () => http.get<StickerGroup[]>("/api/sticker-groups"),
  /** 整份分組存回去，回傳後端整理過的版本 */
  saveGroups: (groups: StickerGroup[]) => http.put<StickerGroup[]>("/api/sticker-groups", groups),
};

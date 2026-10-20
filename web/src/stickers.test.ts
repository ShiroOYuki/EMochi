import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sticker, StickerGroup } from "./api";

// saveGroups 會呼叫後端：換成可控制的假 API
const saveGroupsMock = vi.fn<(groups: StickerGroup[]) => Promise<StickerGroup[]>>();
vi.mock("./api", () => ({
  stickersApi: {
    saveGroups: (groups: StickerGroup[]) => saveGroupsMock(groups),
    listAll: vi.fn(),
    groups: vi.fn(),
  },
}));

const { deriveStickers, saveGroups, getStickerState } = await import("./stickers");

const sticker = (id: number, deleted = false): Sticker => ({
  id,
  name: `s${id}`,
  label: `S${id}`,
  zh: "",
  prompt: "",
  deleted,
});
const group = (id: number, ids: number[], isDefault = false): StickerGroup => ({
  id,
  name: `g${id}`,
  ids,
  default: isDefault,
});

describe("deriveStickers", () => {
  it("分出使用中、已刪除、未分組、預設勾選", () => {
    const all = [sticker(1), sticker(2), sticker(3, true), sticker(4)];
    const d = deriveStickers(all, [group(1, [2, 1], true), group(2, [4, 2], true), group(3, [3])]);
    expect(d.active.map((s) => s.id)).toEqual([1, 2, 4]);
    expect(d.deleted.map((s) => s.id)).toEqual([3]);
    expect(d.ungrouped).toEqual([]);
    expect(d.defaults).toEqual([1, 2, 4]);
    expect(d.byId.get(3)?.deleted).toBe(true);
  });
  it("不在任何分組的算未分組（已刪除的不算）", () => {
    const d = deriveStickers([sticker(1), sticker(2), sticker(3, true)], [group(1, [1])]);
    expect(d.ungrouped.map((s) => s.id)).toEqual([2]);
    expect(d.defaults).toEqual([]);
  });
});

describe("saveGroups", () => {
  // 不能寫成 () => saveGroupsMock.mockReset()：beforeEach 回傳函式會被當成清理函式，在測試後被呼叫
  beforeEach(() => {
    saveGroupsMock.mockReset();
  });

  it("先更新畫面，再換成後端回傳的版本", async () => {
    const next = [group(1, [1, 2])];
    saveGroupsMock.mockResolvedValue([{ ...next[0], name: "後端整理過" }]);
    const p = saveGroups(next);
    expect(getStickerState().groups).toEqual(next); // 樂觀更新
    await p;
    expect(getStickerState().groups[0].name).toBe("後端整理過");
  });

  it("失敗時退回原本的分組並丟出錯誤", async () => {
    const before = getStickerState().groups;
    saveGroupsMock.mockRejectedValue(new Error("壞掉"));
    await expect(saveGroups([group(9, [])])).rejects.toThrow("壞掉");
    expect(getStickerState().groups).toBe(before);
  });

  it("連續存兩次：只採用最後一次的回應，舊回應晚到也不會蓋掉", async () => {
    let resolveFirst!: (g: StickerGroup[]) => void;
    saveGroupsMock
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([group(2, [2], false)]);
    const first = saveGroups([group(1, [1])]);
    await saveGroups([group(2, [2])]);
    resolveFirst([group(1, [1])]); // 第一次的回應比較晚到
    await first;
    expect(getStickerState().groups.map((g) => g.id)).toEqual([2]);
  });
});

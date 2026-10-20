import { describe, expect, it } from "vitest";
import { groupPresets, legacyToPresets, OTHER_GROUP, parseSizes, sizeText } from "./exportPresets";

describe("parseSizes", () => {
  it("正方形、長方形、各種分隔符號", () => {
    expect(parseSizes("256, 300x200")).toEqual([
      { w: 256, h: 256 },
      { w: 300, h: 200 },
    ]);
    expect(parseSizes("112，56、28 64×32")).toEqual([
      { w: 112, h: 112 },
      { w: 56, h: 56 },
      { w: 28, h: 28 },
      { w: 64, h: 32 },
    ]);
  });
  it("格式不對或超出 8～2048 回傳 null", () => {
    expect(parseSizes("")).toBeNull();
    expect(parseSizes("abc")).toBeNull();
    expect(parseSizes("4")).toBeNull();
    expect(parseSizes("4096")).toBeNull();
    expect(parseSizes("256, 300x")).toBeNull();
  });
});

describe("sizeText", () => {
  it("正方形只寫一個數字", () => {
    expect(sizeText({ w: 112, h: 112 })).toBe("112");
    expect(sizeText({ w: 300, h: 200 })).toBe("300×200");
  });
  it("和 parseSizes 互為反向", () => {
    const sizes = [
      { w: 128, h: 128 },
      { w: 300, h: 200 },
    ];
    expect(parseSizes(sizes.map(sizeText).join(", ").replace(/×/g, "x"))).toEqual(sizes);
  });
});

describe("legacyToPresets", () => {
  it("舊格式代號換成預設集 id、去重、丟掉不認得的", () => {
    expect(legacyToPresets(["t112", "t56", "discord", "unknown"])).toEqual(["twitch", "discord"]);
  });
});

describe("groupPresets", () => {
  it("分組依第一次出現的順序，「其他」（空白）放最後", () => {
    const out = groupPresets([
      { id: "a", group: "" },
      { id: "b", group: "Twitch" },
      { id: "c", group: "LINE" },
      { id: "d", group: "Twitch" },
    ]);
    expect(out.map((g) => g.group)).toEqual(["Twitch", "LINE", OTHER_GROUP]);
    expect(out[0].items.map((x) => x.id)).toEqual(["b", "d"]);
  });
});

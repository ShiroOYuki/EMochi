import { describe, expect, it } from "vitest";
import { hrefOf, parseHash } from "./router";

describe("parseHash", () => {
  it("分頁與 id", () => {
    expect(parseHash("#/gen/s12")).toEqual({ tab: "gen", id: "s12" });
    expect(parseHash("#/characters/c2")).toEqual({ tab: "characters", id: "c2" });
    expect(parseHash("#/gallery")).toEqual({ tab: "gallery", id: null });
  });
  it("空的、不認得的分頁都當作生成頁", () => {
    expect(parseHash("")).toEqual({ tab: "gen", id: null });
    expect(parseHash("#/whatever/x")).toEqual({ tab: "gen", id: "x" });
  });
  it("和 hrefOf 互為反向（含需要編碼的字）", () => {
    for (const r of [
      { tab: "styles", id: "st1" },
      { tab: "gen", id: null },
      { tab: "characters", id: "角色 1" },
    ] as const)
      expect(parseHash(hrefOf(r))).toEqual(r);
  });
});

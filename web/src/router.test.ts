import { describe, expect, it } from "vitest";
import { parsePath, pathOf } from "./router";

describe("parsePath", () => {
  it("分頁與 id", () => {
    expect(parsePath("/gen/s12")).toEqual({ tab: "gen", id: "s12" });
    expect(parsePath("/characters/c2")).toEqual({ tab: "characters", id: "c2" });
    expect(parsePath("/gallery")).toEqual({ tab: "gallery", id: null });
  });
  it("空的、不認得的分頁都當作生成頁", () => {
    expect(parsePath("/")).toEqual({ tab: "gen", id: null });
    expect(parsePath("/whatever/x")).toEqual({ tab: "gen", id: "x" });
  });
  it("和 pathOf 互為反向（含需要編碼的字）", () => {
    for (const r of [
      { tab: "styles", id: "st1" },
      { tab: "gen", id: null },
      { tab: "characters", id: "角色 1" },
    ] as const)
      expect(parsePath(pathOf(r))).toEqual(r);
  });
});

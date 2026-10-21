import { describe, expect, it } from "vitest";
import { dismiss, toast, toastError } from "./toast";

describe("toast", () => {
  it("同樣的訊息還在畫面上就不重複疊", () => {
    const a = toast.error({ title: "讀取資料失敗", body: "HTTP 500" });
    const b = toast.error({ title: "讀取資料失敗", body: "HTTP 500" });
    expect(b).toBe(a);
    dismiss(a);
    expect(toast.error({ title: "讀取資料失敗", body: "HTTP 500" })).not.toBe(a);
  });

  it("toastError 取 Error 的訊息當內文", () => {
    const id = toastError(new Error("後端說不行"), "匯出失敗");
    expect(typeof id).toBe("number");
    expect(toastError(new Error("後端說不行"), "匯出失敗")).toBe(id); // 同一則
  });
});

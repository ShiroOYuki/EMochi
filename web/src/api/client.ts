// 後端呼叫的底層：fetch 包裝、錯誤轉成 Error(detail)、檔案網址、上傳前讀檔
import type { RefRole, Upload } from "./types";

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = (data as { detail?: unknown }).detail;
    // 422＝參數驗證失敗，FastAPI 給的是陣列
    let msg = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `HTTP ${r.status}`;
    // 500＝後端程式 bug（app/errors.py 以外的例外），請使用者回報
    if (r.status === 500) msg += "（程式錯誤，可以到「設定 → 說明 → 回報問題」回報）";
    throw new ApiError(msg, r.status);
  }
  return data as T;
}

/** 後端回的錯誤；status：404 找不到、400 輸入不對、409 目前狀態不允許、502 Codex 失敗、500 程式錯誤 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 低階 HTTP 呼叫：只給 api/ 底下的模組用，元件請用各領域的 xxxApi */
export const http = {
  get: <T>(url: string) => req<T>("GET", url),
  post: <T>(url: string, body: unknown = {}) => req<T>("POST", url, body),
  patch: <T>(url: string, body: unknown) => req<T>("PATCH", url, body),
  put: <T>(url: string, body: unknown) => req<T>("PUT", url, body),
  del: <T>(url: string) => req<T>("DELETE", url),
};

/** outputs/、exports/ 底下的檔案網址；v 用來避免瀏覽器快取舊圖 */
export const fileUrl = (path: string, v?: string | number | null) =>
  `/files/${path}${v ? `?v=${encodeURIComponent(String(v))}` : ""}`;

/** 瀏覽器端把檔案讀成 data URL（後端再轉成 PNG） */
export const readFiles = (files: Iterable<File>, role?: RefRole): Promise<Upload[]> =>
  Promise.all(
    [...files]
      .filter((f) => f.type.startsWith("image/"))
      .map(
        (f) =>
          new Promise<Upload>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve({ name: f.name || "pasted.png", data: String(r.result), role });
            r.onerror = () => reject(r.error);
            r.readAsDataURL(f);
          }),
      ),
  );

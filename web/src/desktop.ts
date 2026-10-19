/** 桌面版（Electron）透過 preload 掛在 window.emochi 的功能；網頁版沒有這個物件 */
export type UpdateState = {
  /** dev：開發模式不檢查；idle：還沒檢查；latest：已是最新；downloading：背景下載中；ready：下載好，重新啟動即可更新 */
  state: "dev" | "idle" | "checking" | "latest" | "downloading" | "ready" | "error";
  version: string | null; percent: number; error: string | null; checkedAt: number | null;
};

export type DesktopBridge = {
  version: string;
  /** 原生的選資料夾視窗；取消時回傳 null */
  pickFolder: (initial?: string) => Promise<string | null>;
  /** 讓視窗底色、原生對話框跟著介面主題（舊版殼沒有這個） */
  setTheme?: (pref: "system" | "light" | "dark") => void;
  /** 自動更新（舊版殼沒有） */
  updates?: {
    get: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    install: (force?: boolean) => Promise<{ ok: boolean; running?: number; reason?: string }>;
    onStatus: (cb: (s: UpdateState) => void) => () => void;
  };
  /** 自訂標題列的視窗按鈕（視窗沒有 Windows 原生標題列） */
  window: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    isMaximized: () => boolean;
    onMaximized: (cb: (maximized: boolean) => void) => () => void;
  };
};

export const desktop: DesktopBridge | undefined = (window as unknown as { emochi?: DesktopBridge }).emochi;

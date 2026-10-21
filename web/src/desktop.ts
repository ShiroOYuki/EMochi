/** 桌面版（Electron）透過 preload 掛在 window.emochi 的功能；網頁版沒有這個物件 */
export type UpdateState = {
  /** dev：開發模式不檢查；idle：還沒檢查；latest：已是最新；available：有新版（還沒下載）；
   *  downloading：下載中；ready：下載好，按「重新啟動並安裝」；error：檢查或下載失敗（version 還在＝下載失敗，可重試） */
  state: "dev" | "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";
  version: string | null;
  percent: number;
  error: string | null;
  checkedAt: number | null;
  /** 這個版本在 GitHub Releases 的頁面（更新內容） */
  notesUrl: string | null;
};

export type DesktopBridge = {
  version: string;
  /** 原生的選資料夾視窗；取消時回傳 null */
  pickFolder: (initial?: string) => Promise<string | null>;
  /** 讓視窗底色、原生對話框跟著介面主題（舊版殼沒有這個） */
  setTheme?: (pref: "system" | "light" | "dark") => void;
  /** 打開桌面程式的 log 資料夾，回傳路徑（舊版殼沒有） */
  openLogs?: () => Promise<string>;
  /** 系統通知（舊版殼沒有，改用瀏覽器的 Notification）；回傳 false＝這台電腦不支援 */
  notify?: (n: { title: string; body?: string; project?: string }) => Promise<boolean>;
  /** 使用者點了通知（視窗已被叫到前面）；回傳取消訂閱的函式 */
  onNotifyClick?: (cb: (project: string) => void) => () => void;
  /** 自動更新（舊版殼沒有） */
  updates?: {
    get: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
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

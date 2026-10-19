/** 桌面版（Electron）透過 preload 掛在 window.emochi 的功能；網頁版沒有這個物件 */
export type DesktopBridge = {
  version: string;
  /** 原生的選資料夾視窗；取消時回傳 null */
  pickFolder: (initial?: string) => Promise<string | null>;
  /** 讓視窗底色、原生對話框跟著介面主題（舊版殼沒有這個） */
  setTheme?: (pref: "system" | "light" | "dark") => void;
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

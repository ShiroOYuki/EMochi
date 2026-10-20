// 給網頁用的桌面功能（window.emochi）；網頁版沒有這個物件，前端會改走伺服器 API
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("emochi", {
  version: ipcRenderer.sendSync("app-version"),
  pickFolder: (initial) => ipcRenderer.invoke("pick-folder", initial),
  setTheme: (pref) => ipcRenderer.send("set-theme", pref),
  /** 打開桌面程式的 log 資料夾（%APPDATA%\\EMochi\\logs：server.log、updater.log） */
  openLogs: () => ipcRenderer.invoke("open-logs"),
  /** 系統通知；點通知時主程序把視窗叫到前面，再呼叫 onNotifyClick 的 cb(專案編號) */
  notify: (n) => ipcRenderer.invoke("notify", n),
  onNotifyClick: (cb) => {
    const h = (_e, project) => cb(project);
    ipcRenderer.on("notify-click", h);
    return () => ipcRenderer.removeListener("notify-click", h);
  },
  updates: {
    get: () => ipcRenderer.invoke("update-get"),
    check: () => ipcRenderer.invoke("update-check"),
    download: () => ipcRenderer.invoke("update-download"),
    /** force：有 Codex 在跑也照樣更新 */
    install: (force) => ipcRenderer.invoke("update-install", !!force),
    onStatus: (cb) => {
      const h = (_e, s) => cb(s);
      ipcRenderer.on("update-status", h);
      return () => ipcRenderer.removeListener("update-status", h);
    },
  },
  window: {
    minimize: () => ipcRenderer.send("win", "minimize"),
    toggleMaximize: () => ipcRenderer.send("win", "toggle-maximize"),
    close: () => ipcRenderer.send("win", "close"),
    isMaximized: () => ipcRenderer.sendSync("win-is-maximized"),
    /** 最大化狀態改變時呼叫 cb；回傳取消訂閱的函式 */
    onMaximized: (cb) => {
      const h = (_e, v) => cb(v);
      ipcRenderer.on("win-maximized", h);
      return () => ipcRenderer.removeListener("win-maximized", h);
    },
  },
});

// 給網頁用的桌面功能（window.emochi）；網頁版沒有這個物件，前端會改走伺服器 API
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("emochi", {
  version: ipcRenderer.sendSync("app-version"),
  pickFolder: (initial) => ipcRenderer.invoke("pick-folder", initial),
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

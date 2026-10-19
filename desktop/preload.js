// 給網頁用的桌面功能（window.emochi）；網頁版沒有這個物件，前端會改走伺服器 API
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("emochi", {
  version: ipcRenderer.sendSync("app-version"),
  pickFolder: (initial) => ipcRenderer.invoke("pick-folder", initial),
});

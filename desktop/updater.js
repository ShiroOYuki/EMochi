// 自動更新（electron-updater）：安裝檔發在 ShiroOYuki/EMochi 的 Releases（package.json build.publish；repo 要公開 App 才下載得到）
//   啟動 10 秒後檢查一次，之後每 6 小時；有新版就背景下載（.blockmap 差分，只抓變動的部分）
//   下載好通知前端；使用者按「重新啟動並更新」才裝。沒按的話，下次正常關閉 App 時也會自動安裝
//   開發模式（npm run dev）不檢查
const { app, ipcMain, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const FIRST_CHECK_MS = 10_000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

let updater = null;
let state = { state: app.isPackaged ? "idle" : "dev", version: null, percent: 0, error: null, checkedAt: null };

function set(patch) {
  state = { ...state, ...patch };
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("update-status", state);
}

function log(...args) {
  try {
    const f = path.join(app.getPath("logs"), "updater.log");
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${args.join(" ")}\n`);
  } catch { /* 寫不了就算了 */ }
}

async function check() {
  if (!updater || ["checking", "downloading", "ready"].includes(state.state)) return state;
  try {
    await updater.checkForUpdates();
  } catch (e) {
    set({ state: "error", error: String(e?.message || e) });
  }
  return state;
}

/**
 * @param {{ codexRunning: () => Promise<number>, beforeInstall: () => Promise<void> }} hooks
 *   codexRunning：目前有幾個 Codex 在跑（有的話先讓使用者確認）
 *   beforeInstall：標記正在結束、停掉後端（安裝程式只會關 EMochi.exe，後端還開著會鎖住檔案）
 */
function setup({ codexRunning, beforeInstall }) {
  ipcMain.handle("update-get", () => state);
  ipcMain.handle("update-check", () => check());
  ipcMain.handle("update-install", async (_e, force) => {
    if (state.state !== "ready") return { ok: false, reason: "還沒有下載好的更新" };
    const running = await codexRunning().catch(() => 0);
    if (running > 0 && !force) return { ok: false, running };
    log("install", state.version);
    await beforeInstall();
    updater.quitAndInstall(true, true);   // 靜默安裝，裝完自動重新開啟
    return { ok: true };
  });
  if (!app.isPackaged) return;

  ({ autoUpdater: updater } = require("electron-updater"));
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.disableWebInstaller = true;   // 只用完整安裝檔（不用 NSIS web installer）
  updater.logger = { info: (m) => log("info", m), warn: (m) => log("warn", m), error: (m) => log("error", m), debug: () => {} };
  updater.on("checking-for-update", () => set({ state: "checking", error: null }));
  updater.on("update-not-available", () => set({ state: "latest", checkedAt: Date.now() }));
  updater.on("update-available", (info) => set({ state: "downloading", version: info.version, percent: 0, checkedAt: Date.now() }));
  updater.on("download-progress", (p) => set({ state: "downloading", percent: Math.round(p.percent) }));
  updater.on("update-downloaded", (info) => set({ state: "ready", version: info.version, percent: 100 }));
  updater.on("error", (e) => set({ state: "error", error: String(e?.message || e) }));

  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, INTERVAL_MS);
}

module.exports = { setup };

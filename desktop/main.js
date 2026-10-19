// EMochi 桌面版：啟動 Python 後端（FastAPI）→ 等它回應 → 開視窗載入同一套 React 前端
//   開發：npm run dev   → uv run python -m app（資料根目錄＝原始碼資料夾，和網頁版共用資料）
//   打包：resources/server/emochi-server.exe（資料根目錄＝%LOCALAPPDATA%\EMochi，可在設定頁改各資料夾）
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const DEV = !app.isPackaged;
const REPO = path.resolve(__dirname, "..");
const DATA_ROOT = DEV ? REPO : path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "EMochi");
const HEALTH_TIMEOUT_MS = 60_000;

let server = null;        // 後端子程序
let baseUrl = "";
let win = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(start);
}

// ---------- 後端 ----------

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function logFile() {
  const dir = app.getPath("logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "server.log");
}

function startServer(port) {
  const args = ["--port", String(port), "--no-browser", "--parent-pid", String(process.pid)];
  const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
  let cmd, cmdArgs, cwd;
  if (DEV) {
    cmd = "uv";
    cmdArgs = ["run", "python", "-m", "app", ...args];
    cwd = REPO;
  } else {
    env.EMOCHI_ROOT = DATA_ROOT;
    cmd = path.join(process.resourcesPath, "server", "emochi-server.exe");
    cmdArgs = args;
    cwd = path.dirname(cmd);
  }
  const out = fs.createWriteStream(logFile(), { flags: "w" });
  out.write(`[${new Date().toISOString()}] ${cmd} ${cmdArgs.join(" ")}\n`);
  server = spawn(cmd, cmdArgs, { cwd, env, windowsHide: true, shell: DEV });   // uv 在 PATH 上可能是 .cmd，開發時經過 shell
  server.stdout.pipe(out);
  server.stderr.pipe(out);
  server.on("exit", (code) => {
    out.write(`\n[${new Date().toISOString()}] server exit ${code}\n`);
    server = null;
    if (!quitting) {
      dialog.showErrorBox("EMochi", `後端意外結束（代碼 ${code}）。\n記錄檔：${logFile()}`);
      app.quit();
    }
  });
}

async function health() {
  const r = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function waitHealthy() {
  const t0 = Date.now();
  while (Date.now() - t0 < HEALTH_TIMEOUT_MS) {
    if (!server) throw new Error("後端沒有啟動");
    try {
      return await health();
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`等了 ${HEALTH_TIMEOUT_MS / 1000} 秒後端都沒有回應`);
}

function stopServer() {
  if (!server) return Promise.resolve();
  const pid = server.pid;
  return new Promise((resolve) => {
    // /T：連同後端開的 Codex 一起結束
    if (process.platform === "win32") execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    else { server.kill(); resolve(); }
  });
}

// ---------- 視窗 ----------

const stateFile = () => path.join(app.getPath("userData"), "window.json");

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return { width: 1440, height: 920 };
  }
}

function saveBounds() {
  if (!win) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch { /* 存不了就算了 */ }
}

const isLocal = (url) => url.startsWith(baseUrl);

function splash() {
  const dark = nativeTheme.shouldUseDarkColors;
  const html = `<html><body style="-webkit-app-region:drag;margin:0;display:grid;place-items:center;height:100vh;font:15px 'Microsoft JhengHei UI',sans-serif;
    background:${dark ? "#1c1b29" : "#faf8ff"};color:${dark ? "#cfcbe6" : "#4a4668"}">EMochi 啟動中…</body></html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function createWindow() {
  const b = loadBounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, minWidth: 960, minHeight: 640,
    title: "EMochi",
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1b29" : "#faf8ff",
    autoHideMenuBar: true,
    // 不用 Windows 的標題列：拖曳區、縮小／最大化／關閉按鈕畫在網頁的 Navbar 上（WindowControls.tsx）。
    // "hidden" 仍保留視窗邊框的縮放、陰影與 Aero Snap
    titleBarStyle: "hidden",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  if (b.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.loadURL(splash());

  // 外部連結用預設瀏覽器開，不在 App 裡開新視窗
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url) && /^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isLocal(url) && !url.startsWith("data:")) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  // 沒有選單列，補上常用快捷鍵
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta;
    if (input.key === "F12" || (ctrl && input.shift && input.key.toLowerCase() === "i")) win.webContents.toggleDevTools();
    else if (input.key === "F5" || (ctrl && input.key.toLowerCase() === "r")) win.webContents.reload();
    else return;
    e.preventDefault();
  });

  win.on("close", async (e) => {
    saveBounds();
    if (quitting) return;
    e.preventDefault();
    let running = 0;
    try { running = (await health()).codex_running; } catch { /* 後端沒回應就直接關 */ }
    if (running > 0) {
      const { response } = await dialog.showMessageBox(win, {
        type: "warning", buttons: ["仍要關閉", "取消"], defaultId: 1, cancelId: 1, title: "EMochi",
        message: `還有 ${running} 個 Codex 正在生成`,
        detail: "關閉會中斷生成，下次開啟時這些組別會標成失敗，可以再重生。",
      });
      if (response !== 0) return;
    }
    quitting = true;
    await stopServer();
    app.quit();
  });
  win.on("closed", () => { win = null; });
  const sendMax = () => win?.webContents.send("win-maximized", win.isMaximized());
  win.on("maximize", sendMax);
  win.on("unmaximize", sendMax);
}

// ---------- 給前端的功能 ----------

ipcMain.on("app-version", (e) => { e.returnValue = app.getVersion(); });
ipcMain.on("win-is-maximized", (e) => { e.returnValue = !!win?.isMaximized(); });
ipcMain.on("win", (_e, action) => {
  if (!win) return;
  if (action === "minimize") win.minimize();
  else if (action === "toggle-maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === "close") win.close();   // 走 close 事件：Codex 執行中會先詢問
});
ipcMain.handle("pick-folder", async (_e, initial) => {
  const r = await dialog.showOpenDialog(win, {
    title: "選擇資料夾",
    defaultPath: initial && fs.existsSync(initial) ? initial : undefined,
    properties: ["openDirectory", "createDirectory"],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

// ---------- 啟動與結束 ----------

async function start() {
  createWindow();
  try {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    startServer(port);
    await waitHealthy();
    await win.loadURL(baseUrl);
  } catch (err) {
    quitting = true;
    await stopServer();
    dialog.showErrorBox("EMochi 無法啟動", `${err.message}\n\n記錄檔：${logFile()}`);
    app.quit();
  }
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { quitting = true; });
app.on("will-quit", (e) => {
  if (server) {
    e.preventDefault();
    stopServer().then(() => app.quit());
  }
});

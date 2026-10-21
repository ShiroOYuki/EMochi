// EMochi 桌面版：啟動 Python 後端（FastAPI）→ 等它回應 → 開視窗載入同一套 React 前端
//   開發：npm run dev   → uv run python -m app（資料根目錄＝原始碼資料夾，和網頁版共用資料）
//   打包：resources/server/emochi-server.exe（資料根目錄＝%LOCALAPPDATA%\EMochi，可在設定頁改各資料夾）
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, Notification, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const updater = require("./updater");

const DEV = !app.isPackaged;
const REPO = path.resolve(__dirname, "..");
const DATA_ROOT = DEV ? REPO : path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "EMochi");
const HEALTH_TIMEOUT_MS = 60_000;
// 固定用這個 port（被占用才隨機找）：網址的 origin 不變，前端存在 localStorage 的東西（Gallery 勾選、版面等）才不會每次開都不見
// 開發模式用另一個 port，和安裝版的 localStorage 分開
const PREFERRED_PORT = DEV ? 38766 : 38765;

// 開發模式和安裝版都叫 EMochi，預設會共用 %APPDATA%\EMochi（單一實例鎖、window.json、logs、瀏覽器資料）：
// 安裝版開著時開發版會直接被擋掉。開發模式改用 %APPDATA%\EMochi-dev，兩個可以同時開。
// 一定要在 requestSingleInstanceLock() 之前設定（鎖跟著 userData 走）
if (DEV) {
  const devData = path.join(app.getPath("appData"), "EMochi-dev");
  app.setPath("userData", devData);
  app.setAppLogsPath(path.join(devData, "logs"));
}

// Windows 的通知要有 AppUserModelID，而且要和開始功能表捷徑上的一致（NSIS 安裝時用 build.appId）。
// 開發模式沒有捷徑，設了反而通知不會出來，維持 Electron 預設
if (!DEV && process.platform === "win32") app.setAppUserModelId("com.ciel.emochi");

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

function freePort(port = 0) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (e) => (port ? freePort(0).then(resolve, reject) : reject(e)));
    s.listen(port, "127.0.0.1", () => {
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

let saved = null;   // window.json：視窗位置大小、主題偏好

function saveState(patch = {}) {
  saved = { ...(saved ?? loadBounds()), ...patch };
  if (win) Object.assign(saved, win.getNormalBounds(), { maximized: win.isMaximized() });
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(saved));
  } catch { /* 存不了就算了 */ }
}
const saveBounds = () => saveState();

// 主題以設定檔（/api/ui-prefs）為準；這裡只記一份，讓下次啟動畫面、視窗底色一開始就對
const BG = { dark: "#1c1b29", light: "#faf8ff" };
const isDark = () => nativeTheme.shouldUseDarkColors;
function applyTheme(pref) {
  if (!["system", "light", "dark"].includes(pref)) return;
  nativeTheme.themeSource = pref;
  win?.setBackgroundColor(isDark() ? BG.dark : BG.light);
  if (saved?.theme !== pref) saveState({ theme: pref });
}

const isLocal = (url) => url.startsWith(baseUrl);

/** 啟動畫面（等後端好之前）：狐狸耳朵像麻糬一樣彈跳＋「啟動中」三個點輪流跳；
 *  系統開了「減少動態效果」就不動。data: URL 不能載外部字型，用系統字 */
function splash() {
  const dark = isDark();
  const c = dark
    ? { bg: BG.dark, text: "#ece9ff", mute: "#a29fc4", panel: "#2a2742", acc: "#7c9dff", track: "#2f2c48", shadow: "rgba(0,0,0,.35)" }
    : { bg: BG.light, text: "#34315a", mute: "#8a87a8", panel: "#ffffff", acc: "#5a86f0", track: "#e2e0f1", shadow: "rgba(52,49,90,.18)" };
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{height:100%;margin:0}
  body{-webkit-app-region:drag;display:grid;place-items:center;background:${c.bg};color:${c.text};
    font:15px "Microsoft JhengHei UI","Microsoft JhengHei",sans-serif;user-select:none;cursor:default}
  .wrap{display:flex;flex-direction:column;align-items:center;gap:14px;animation:fade .4s ease-out both}
  .stage{position:relative;width:96px;height:92px}
  /* 彈跳拆成兩層：.jump 管上下（上升減速、下降加速，中間不停頓），.ears 管落地／起跳時的擠壓；
     緩動寫在各個影格裡（只寫在 animation 上的話每一段都會減速到停，看起來一頓一頓的） */
  .jump{position:absolute;left:12px;top:6px;width:72px;height:53px;will-change:transform;animation:jump 1.2s infinite}
  .ears{display:block;width:100%;height:100%;transform-origin:50% 100%;will-change:transform;animation:squash 1.2s infinite}
  .shadow{position:absolute;left:24px;bottom:4px;width:48px;height:9px;border-radius:50%;background:${c.shadow};
    will-change:transform,opacity;animation:shadow 1.2s infinite}
  h1{margin:0;font-size:22px;font-weight:600;letter-spacing:.5px}
  .status{color:${c.mute};font-size:13px;display:flex;align-items:baseline;gap:1px}
  .dot{display:inline-block;animation:dot 1.2s infinite}
  .dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
  .bar{width:120px;height:4px;border-radius:4px;background:${c.track};overflow:hidden}
  .bar i{display:block;width:40%;height:100%;border-radius:4px;background:${c.acc};will-change:transform;animation:slide 1.6s cubic-bezier(.45,0,.55,1) infinite}
  @keyframes jump{
    0%{transform:translateY(0);animation-timing-function:cubic-bezier(.2,.6,.35,1)}
    42%{transform:translateY(-26px);animation-timing-function:cubic-bezier(.6,0,.8,.4)}
    80%,100%{transform:translateY(0)}}
  @keyframes squash{
    0%{transform:scale(.93,1.08);animation-timing-function:ease-out}
    22%{transform:scale(1,1)}
    60%{transform:scale(1,1);animation-timing-function:ease-in}
    80%{transform:scale(.95,1.06);animation-timing-function:cubic-bezier(.2,.7,.4,1)}
    88%{transform:scale(1.3,.7);animation-timing-function:ease-in-out}
    95%{transform:scale(1.08,.92);animation-timing-function:ease-in-out}
    100%{transform:scale(.93,1.08)}}
  @keyframes shadow{
    0%{transform:scaleX(1);opacity:1;animation-timing-function:cubic-bezier(.2,.6,.35,1)}
    42%{transform:scaleX(.55);opacity:.45;animation-timing-function:cubic-bezier(.6,0,.8,.4)}
    80%{transform:scaleX(1);opacity:1;animation-timing-function:cubic-bezier(.2,.7,.4,1)}
    88%{transform:scaleX(1.25);opacity:1;animation-timing-function:ease-in-out}
    100%{transform:scaleX(1);opacity:1}}
  @keyframes dot{0%,60%,100%{transform:translateY(0);animation-timing-function:ease-out}30%{transform:translateY(-3px);animation-timing-function:ease-in}}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}}
  @media (prefers-reduced-motion:reduce){.jump,.ears,.shadow,.dot,.bar i,.wrap{animation:none}.bar i{width:100%;opacity:.5}}
  </style></head><body><div class="wrap" role="status" aria-label="EMochi 啟動中">
    <div class="stage">
      <div class="jump"><svg class="ears" viewBox="0 0 30 22" aria-hidden="true">
        <path d="M2 21 L7 2 L14 15 Z" fill="${c.panel}" stroke="${c.text}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M6.5 15 L8 7 L11.5 13.5 Z" fill="#ff8db3"/>
        <path d="M28 21 L23 2 L16 15 Z" fill="${c.panel}" stroke="${c.text}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M23.5 15 L22 7 L18.5 13.5 Z" fill="#ff8db3"/>
      </svg></div>
      <div class="shadow"></div>
    </div>
    <h1>EMochi</h1>
    <div class="bar"><i></i></div>
    <div class="status">啟動中<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>
  </div></body></html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function createWindow() {
  const b = loadBounds();
  saved = b;
  if (b.theme) nativeTheme.themeSource = b.theme;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, minWidth: 960, minHeight: 640,
    title: "EMochi",
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: isDark() ? BG.dark : BG.light,
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
    if (!isLocal(url) && /^(https?|mailto):/.test(url)) shell.openExternal(url);   // mailto：回報問題用預設郵件程式開
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isLocal(url) && !url.startsWith("data:")) {
      e.preventDefault();
      if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
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
ipcMain.on("set-theme", (_e, pref) => applyTheme(pref));
ipcMain.handle("open-logs", async () => {
  const dir = app.getPath("logs");
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
});
// 設定頁「重新啟動」：有 Codex 在生成時先回報數量讓前端確認（force＝確認過了）；
// 自己停掉後端再 relaunch（app.exit 不會觸發 will-quit 的收尾）
ipcMain.handle("relaunch", async (_e, force) => {
  let running = 0;
  try { running = (await health()).codex_running; } catch { /* 後端沒回應就直接重開 */ }
  if (running > 0 && !force) return { ok: false, running };
  quitting = true;
  saveBounds();
  await stopServer();
  app.relaunch();
  app.exit(0);
  return { ok: true };
});
ipcMain.on("win-is-maximized", (e) => { e.returnValue = !!win?.isMaximized(); });
ipcMain.on("win", (_e, action) => {
  if (!win) return;
  if (action === "minimize") win.minimize();
  else if (action === "toggle-maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === "close") win.close();   // 走 close 事件：Codex 執行中會先詢問
});
// 桌面通知（生圖完成／失敗）：前端決定要不要發（視窗在前景就不發），這裡負責顯示和點擊
const notes = new Set();   // 留著參考：Notification 被回收後，點擊事件就收不到了
function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
ipcMain.handle("notify", (_e, n) => {
  if (!Notification.isSupported()) return false;
  const note = new Notification({ title: String(n?.title || "EMochi"), body: String(n?.body || ""), icon: path.join(__dirname, "assets", "icon.png") });
  notes.add(note);
  const drop = () => notes.delete(note);
  note.on("click", () => {
    drop();
    showWindow();
    if (n?.project) win?.webContents.send("notify-click", String(n.project));
  });
  note.on("close", drop);
  note.on("failed", drop);
  note.show();
  return true;
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
  updater.setup({
    codexRunning: async () => (await health()).codex_running,
    beforeInstall: async () => { quitting = true; saveBounds(); await stopServer(); },
  });
  try {
    const port = await freePort(PREFERRED_PORT);
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

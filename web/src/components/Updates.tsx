import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "../toast";
import { desktop, type UpdateState } from "../desktop";
import { Modal } from "./ui";

/** 桌面版的更新狀態（electron-updater，見 desktop/updater.js）；網頁版回傳 null。
 *  自動檢查只查版本；下載、安裝都要使用者按按鈕 */
export function useUpdateState(): UpdateState | null {
  const u = desktop?.updates;
  const [s, setS] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!u) return;
    u.get().then(setS);
    return u.onStatus(setS);
  }, [u]);
  return s;
}

const DownloadIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);

/** 「重新啟動並安裝」：有 Codex 在生成時先確認（重新啟動會中斷生成） */
export function InstallUpdateButton({
  className = "btn btn-primary",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [running, setRunning] = useState(0);
  const [busy, setBusy] = useState(false);
  const install = async (force = false) => {
    setBusy(true);
    const r = await desktop!.updates!.install(force);
    if (!r.ok) {
      setBusy(false);
      if (r.running) setRunning(r.running);
    }
  };
  return (
    <>
      <button className={className} disabled={busy} onClick={() => install()}>
        {busy ? "準備重新啟動…" : children}
      </button>
      <Modal open={running > 0} onClose={() => setRunning(0)} label="確認更新">
        <h3 className="mb-2 text-lg">還有 {running} 個 Codex 正在生成</h3>
        <p className="mb-5 text-sm text-mute">
          現在重新啟動會中斷生成，這些組別會標成失敗，之後可以再重生。也可以等生成完再回來按「重新啟動並安裝」。
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setRunning(0)}>
            稍後再說
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setRunning(0);
              install(true);
            }}
          >
            仍要重新啟動
          </button>
        </div>
      </Modal>
    </>
  );
}

const download = () => desktop?.updates?.download();

/** Navbar：有新版（下載前、下載中、下載好）才出現；按了才下載／安裝 */
export function UpdateBadge() {
  const s = useUpdateState();
  if (!s) return null;
  if (s.state === "available" || (s.state === "error" && s.version)) {
    return (
      <button
        className="btn btn-sm whitespace-nowrap border-acc text-acc"
        onClick={download}
        title={s.state === "error" ? `下載失敗：${s.error ?? ""}` : "按下開始下載，不會自動安裝"}
      >
        <DownloadIcon />
        {s.state === "error" ? `v${s.version} 下載失敗，重試` : `v${s.version} 可更新`}
      </button>
    );
  }
  if (s.state === "downloading") {
    return (
      <span
        className="relative inline-flex items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs text-mute"
        role="status"
      >
        <span
          className="absolute inset-y-0 left-0 bg-acc/15 transition-[width]"
          style={{ width: `${s.percent}%` }}
          aria-hidden="true"
        />
        <span className="relative">
          下載 v{s.version}… {s.percent}%
        </span>
      </span>
    );
  }
  if (s.state === "ready") {
    return (
      <InstallUpdateButton className="btn btn-sm btn-primary whitespace-nowrap">
        <DownloadIcon />
        重新啟動並安裝 v{s.version}
      </InstallUpdateButton>
    );
  }
  return null;
}

const fmtTime = (t: number | null) => (t ? new Date(t).toLocaleString("zh-TW", { hour12: false }) : "");

/** 設定頁「關於」：目前版本、更新狀態、檢查／下載／安裝 */
export function AboutUpdates() {
  const s = useUpdateState();
  const [checking, setChecking] = useState(false);
  const d = desktop;
  if (!d) return null;
  const check = async () => {
    setChecking(true);
    try {
      await d.updates?.check();
    } finally {
      setChecking(false);
    }
  };
  const downloadFailed = s?.state === "error" && !!s.version;
  const text = !s
    ? ""
    : {
        dev: "開發模式不檢查更新",
        idle: "啟動後會自動檢查有沒有新版（只檢查，不會自動下載）",
        checking: "檢查中…",
        latest: `已是最新版本${s.checkedAt ? `（${fmtTime(s.checkedAt)} 檢查）` : ""}`,
        available: `有新版本 v${s.version}`,
        downloading: `正在下載 v${s.version}…${s.percent}%`,
        ready: `v${s.version} 已下載好，重新啟動後安裝`,
        error: downloadFailed
          ? `v${s.version} 下載失敗：${s.error ?? "未知錯誤"}`
          : `檢查失敗：${s.error ?? "未知錯誤"}`,
      }[s.state];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">EMochi v{d.version}</span>
        <span className={`min-w-0 flex-1 text-xs ${s?.state === "error" ? "text-bad" : "text-mute"}`}>
          {text}
          {s?.notesUrl && ["available", "downloading", "ready"].includes(s.state) && (
            <a href={s.notesUrl} target="_blank" rel="noreferrer" className="ml-2 text-acc hover:underline">
              看更新內容
            </a>
          )}
        </span>
        {d.updates &&
          s &&
          s.state !== "dev" &&
          (s.state === "ready" ? (
            <InstallUpdateButton className="btn btn-sm btn-primary">重新啟動並安裝</InstallUpdateButton>
          ) : s.state === "available" || downloadFailed ? (
            <button className="btn btn-sm btn-primary" onClick={download}>
              <DownloadIcon />
              {downloadFailed ? "重試下載" : "下載更新"}
            </button>
          ) : (
            <button
              className="btn btn-sm"
              disabled={checking || s.state === "checking" || s.state === "downloading"}
              onClick={check}
            >
              檢查更新
            </button>
          ))}
      </div>
      {s?.state === "downloading" && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-panel2"
          role="progressbar"
          aria-valuenow={s.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-acc transition-[width]" style={{ width: `${s.percent}%` }} />
        </div>
      )}
    </div>
  );
}

/** 桌面版發現新版本：每個版本跳一次 toast（Navbar 的更新按鈕一直都在） */
export function useUpdateToast() {
  const s = useUpdateState();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (s?.state !== "available" || !s.version || shown.current === s.version) return;
    shown.current = s.version;
    toast.info({
      title: `有新版本 v${s.version}`,
      body: "按下載開始下載，下載好再決定什麼時候重新啟動安裝",
      action: { label: "下載更新", run: () => desktop?.updates?.download() },
    });
  }, [s?.state, s?.version]);
}

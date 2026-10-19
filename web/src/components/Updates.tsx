import { useEffect, useState, type ReactNode } from "react";
import { desktop, type UpdateState } from "../desktop";
import { Modal } from "./ui";

/** 桌面版的更新狀態（electron-updater，見 desktop/updater.js）；網頁版回傳 null */
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

/** 「重新啟動並更新」：有 Codex 在生成時先確認（重新啟動會中斷生成） */
export function InstallUpdateButton({ className = "btn btn-primary", children }: { className?: string; children: ReactNode }) {
  const [running, setRunning] = useState(0);
  const [busy, setBusy] = useState(false);
  const install = async (force = false) => {
    setBusy(true);
    const r = await desktop!.updates!.install(force);
    if (!r.ok) { setBusy(false); if (r.running) setRunning(r.running); }
  };
  return (
    <>
      <button className={className} disabled={busy} onClick={() => install()}>{busy ? "準備重新啟動…" : children}</button>
      <Modal open={running > 0} onClose={() => setRunning(0)} label="確認更新">
        <h3 className="mb-2 text-lg">還有 {running} 個 Codex 正在生成</h3>
        <p className="mb-5 text-sm text-mute">現在重新啟動會中斷生成，這些組別會標成失敗，之後可以再重生。也可以先不更新，下次關閉 EMochi 時會自動安裝。</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setRunning(0)}>稍後再說</button>
          <button className="btn btn-primary" onClick={() => { setRunning(0); install(true); }}>仍要重新啟動</button>
        </div>
      </Modal>
    </>
  );
}

/** Navbar：新版下載好了才出現 */
export function UpdateBadge() {
  const s = useUpdateState();
  if (s?.state !== "ready") return null;
  return (
    <InstallUpdateButton className="btn btn-sm btn-primary whitespace-nowrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
      </svg>
      v{s.version} 已就緒，重新啟動更新
    </InstallUpdateButton>
  );
}

const fmtTime = (t: number | null) => (t ? new Date(t).toLocaleString("zh-TW", { hour12: false }) : "");

/** 設定頁「關於」：目前版本、更新狀態、手動檢查 */
export function AboutUpdates() {
  const s = useUpdateState();
  const [checking, setChecking] = useState(false);
  const d = desktop;
  if (!d) return null;
  const check = async () => { setChecking(true); try { await d.updates?.check(); } finally { setChecking(false); } };
  const text = !s ? "" : {
    dev: "開發模式不檢查更新",
    idle: "啟動後會自動檢查",
    checking: "檢查中…",
    latest: `已是最新版本${s.checkedAt ? `（${fmtTime(s.checkedAt)} 檢查）` : ""}`,
    downloading: `正在下載 v${s.version}…${s.percent}%`,
    ready: `v${s.version} 已下載好，重新啟動即可更新（不按的話，下次關閉 EMochi 時自動安裝）`,
    error: `檢查失敗：${s.error ?? "未知錯誤"}`,
  }[s.state];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm">EMochi v{d.version}</span>
      <span className={`min-w-0 flex-1 text-xs ${s?.state === "error" ? "text-bad" : "text-mute"}`}>{text}</span>
      {s?.state === "ready"
        ? <InstallUpdateButton className="btn btn-sm btn-primary">重新啟動並更新</InstallUpdateButton>
        : d.updates && s?.state !== "dev" && (
          <button className="btn btn-sm" disabled={checking || s?.state === "checking" || s?.state === "downloading"} onClick={check}>檢查更新</button>
        )}
    </div>
  );
}

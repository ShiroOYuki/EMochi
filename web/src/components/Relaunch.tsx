import { useState } from "react";
import { desktop } from "../desktop";
import { Modal } from "./ui";

/** 設定頁「重新啟動」（只有桌面版、而且殼支援才顯示）：整個 App 連同後端重開。
 *  有 Codex 在生成時先確認，重新啟動會中斷生成 */
export function RelaunchButton() {
  const [running, setRunning] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!desktop?.relaunch) return null;
  const relaunch = async (force = false) => {
    setBusy(true);
    const r = await desktop!.relaunch!(force);
    if (!r.ok) {
      setBusy(false);
      if (r.running) setRunning(r.running);
    }
  };
  return (
    <>
      <button className="btn btn-sm" disabled={busy} onClick={() => relaunch()}>
        {busy ? "重新啟動中…" : "重新啟動"}
      </button>
      <Modal open={running > 0} onClose={() => setRunning(0)} label="確認重新啟動">
        <h3 className="mb-2 text-lg">還有 {running} 個 Codex 正在生成</h3>
        <p className="mb-5 text-sm text-mute">
          現在重新啟動會中斷生成，這些組別會標成失敗，之後可以再重生。也可以等生成完再重新啟動。
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setRunning(0)}>
            稍後再說
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setRunning(0);
              relaunch(true);
            }}
          >
            仍要重新啟動
          </button>
        </div>
      </Modal>
    </>
  );
}

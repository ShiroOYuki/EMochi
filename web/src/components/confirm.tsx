/** 確認框：DeleteConfirm（刪除前，移到垃圾桶可還原）、useConfirm（一般確認，取代瀏覽器原生 confirm()） */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Modal, Spinner } from "./ui";

export const DANGER = "border-bad bg-bad text-white hover:border-bad hover:text-white hover:brightness-105";

// ---------- 刪除確認 ----------

export type DeleteTarget = { id: string; title?: string; warn?: ReactNode };

/** target 不是 null 就打開；onConfirm 丟錯時把訊息顯示在框裡 */
export function DeleteConfirm({
  target,
  noun,
  onConfirm,
  onClose,
}: {
  target: DeleteTarget | null;
  noun: string;
  onConfirm: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setErr("");
  }, [target]);
  const go = async () => {
    if (!target) return;
    setBusy(true);
    setErr("");
    try {
      await onConfirm(target.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!target} onClose={() => !busy && onClose()} label={`刪除${noun}`}>
      {target && (
        <div className="space-y-3">
          <h3 className="text-lg">
            刪除{noun} {target.id}
            {target.title ? `「${target.title}」` : ""}？
          </h3>
          <p className="text-sm text-mute">會移到左下角的「垃圾桶」，之後還能還原，或在那裡永久刪除。</p>
          {target.warn && (
            <div className="rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">{target.warn}</div>
          )}
          {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button className={`btn ${DANGER}`} onClick={go} disabled={busy} autoFocus>
              {busy ? (
                <>
                  <Spinner className="size-3.5 border-white border-t-transparent" />
                  刪除中
                </>
              ) : (
                "刪除"
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  ok?: string;
  cancel?: string;
  danger?: boolean;
};

/** App 樣式的確認框：const [confirmDialog, ask] = useConfirm()；if (!(await ask({ title: "…" }))) return;
 *  把 confirmDialog 放進畫面裡。取消、按 Esc、點外面都算「否」 */
export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })),
    [],
  );
  const done = (v: boolean) => {
    req?.resolve(v);
    setReq(null);
  };
  const node = (
    <Modal open={!!req} onClose={() => done(false)} label={req?.title ?? "確認"}>
      {req && (
        <div className="space-y-3">
          <h3 className="text-lg">{req.title}</h3>
          {req.body && <div className="text-sm leading-relaxed text-mute">{req.body}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn" onClick={() => done(false)}>
              {req.cancel ?? "取消"}
            </button>
            <button
              className={`btn ${req.danger ? DANGER : "btn-primary"}`}
              onClick={() => done(true)}
              autoFocus
            >
              {req.ok ?? "確定"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
  return [node, ask];
}

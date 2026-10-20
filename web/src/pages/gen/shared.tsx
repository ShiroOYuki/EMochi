import { useState } from "react";
import { api, fileUrl, type Character, type Project, type Sticker } from "../../api";
import { Modal, Spinner } from "../../components/ui";
import { useConfirm } from "../../components/manage";

export type ViewProps = {
  p: Project; stickers: Sticker[]; act: (fn: () => Promise<Project>) => Promise<void>;
  previewIds: number[]; maxParallel: number; defaultLayout: "3x2" | "4x2w"; onOpenGallery: () => void;
  chars: Character[]; onDelete: () => void;
};

export function LogLink({ path, style }: { path: string; style: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <>
      <button className="btn btn-sm" onClick={async () => setText((await api.get<{ text: string }>(`/api/projects/${style}/log?path=${encodeURIComponent(path)}`)).text)}>紀錄</button>
      <Modal open={text !== null} onClose={() => setText(null)} wide>
        <h3 className="mb-2">{path}</h3>
        <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded-lg bg-panel2 p-3 text-xs">{text}</pre>
      </Modal>
    </>
  );
}

/** 檢查沒過的圖：圖還在的話照樣顯示，讓人自己判斷。
 *  - 重新檢查：用目前的規則再檢查一次（被誤判、或規則改過時）；還是沒過會顯示檢查時間，看得出有按到
 *  - 仍然使用這張：人看過覺得沒問題，直接當成成功（自動檢查門檻是估的，貼邊的構圖常被誤判）
 *  兩個都不會重新生成、不花額度 */
export function FailedImage({ path, v, message, className, onRecheck, onAccept, rechecked, tokens }: {
  path: string; v?: string; message: string; className: string; tokens?: number | null;
  onRecheck?: () => Promise<unknown>; onAccept?: () => Promise<unknown>; rechecked?: string;
}) {
  const [exists, setExists] = useState(true);
  const [busy, setBusy] = useState<"" | "recheck" | "accept">("");
  const run = async (kind: "recheck" | "accept", fn: () => Promise<unknown>) => {
    setBusy(kind);
    try { await fn(); } finally { setBusy(""); }
  };
  const [confirmDialog, ask] = useConfirm();
  const accept = async () => {
    if (!onAccept) return;
    const ok = await ask({
      title: "仍然使用這張圖？",
      body: <>自動檢查覺得背景不夠乾淨。如果真的有問題，切割、去背的結果可能不好；之後還是可以按「重生」重新生成。</>,
      ok: "使用這張",
    });
    if (ok) run("accept", onAccept);
  };
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-bad">{message}<TokenBadge tokens={tokens} /></p>
      {exists && <>
        <img src={fileUrl(path, v)} onError={() => setExists(false)} className={`${className} rounded-lg opacity-90 ring-2 ring-bad/40`} />
        {(onRecheck || onAccept) && <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <span>圖看起來沒問題？</span>
          {onRecheck && <button className="btn btn-sm" disabled={!!busy} onClick={() => run("recheck", onRecheck)}>
            {busy === "recheck" ? <><Spinner className="size-3" />檢查中…</> : "重新檢查"}</button>}
          {onAccept && <button className="btn btn-sm" disabled={!!busy} onClick={accept}>
            {busy === "accept" ? <><Spinner className="size-3" />處理中…</> : "仍然使用這張"}</button>}
          <span>不會重新生成，不花額度</span>
        </div>}
        {confirmDialog}
        {rechecked && <p className="text-xs text-warn" role="status">{rechecked.slice(5, 16)} 重新檢查過，還是沒通過；確定圖沒問題的話可以按「仍然使用這張」</p>}
      </>}
    </div>
  );
}

/** 這張圖花了多少 token（放在圖片旁的文字區，不蓋住圖）（從 Codex 紀錄最後的「tokens used」讀出；被中斷的沒有） */
export function TokenBadge({ tokens }: { tokens?: number | null }) {
  if (tokens == null) return null;
  const short = tokens >= 1000 ? `${(tokens / 1000).toFixed(tokens >= 100_000 ? 0 : 1)}k` : String(tokens);
  return (
    <span title={`這張圖花了 ${tokens.toLocaleString()} tokens`}
      className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-[11px] text-mute tabular-nums ring-1 ring-line">
      {short} tokens
    </span>
  );
}

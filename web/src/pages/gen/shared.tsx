import { useState } from "react";
import { api, fileUrl, type Character, type Project, type Sticker } from "../../api";
import { Modal } from "../../components/ui";

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

/** 檢查沒過的圖：圖還在的話照樣顯示，讓人自己判斷；被誤判時可以「重新檢查」而不用花額度重生 */
export function FailedImage({ path, v, message, className, onRecheck, tokens }: {
  path: string; v?: string; message: string; className: string; onRecheck?: () => void; tokens?: number | null;
}) {
  const [exists, setExists] = useState(true);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-bad">{message}<TokenBadge tokens={tokens} /></p>
      {exists && <>
        <img src={fileUrl(path, v)} onError={() => setExists(false)} className={`${className} rounded-lg opacity-90 ring-2 ring-bad/40`} />
        {onRecheck && <div className="flex items-center gap-2 text-xs text-mute">
          <button className="btn btn-sm" onClick={onRecheck}>圖看起來沒問題？重新檢查</button>
          <span>不會重新生成，不花額度</span>
        </div>}
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

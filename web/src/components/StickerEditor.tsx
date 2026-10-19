import { useEffect, useState } from "react";
import { api, type Sticker } from "../api";
import { reloadStickers, useStickers } from "../stickers";
import { Check, Modal, Select, Spinner } from "./ui";
import { DeleteButton } from "./manage";

type Form = { label: string; zh: string; prompt: string; prompt_no_ears: string; bottom: boolean; group: number };   // 0＝不放進分組
const EMPTY: Form = { label: "", zh: "", prompt: "", prompt_no_ears: "", bottom: false, group: 0 };

/** 新增／編輯表情的對話框（「表情」分頁與 Gen 挑選步驟共用）。
 *  sticker＝null 是新增；onSaved 拿到存好的表情；onDelete 有給才顯示刪除鈕 */
export default function StickerEditor({ open, sticker, defaultGroup, onClose, onSaved, onDelete }: {
  open: boolean; sticker: Sticker | null; defaultGroup?: number | null;
  onClose: () => void; onSaved?: (s: Sticker) => void; onDelete?: (s: Sticker) => void;
}) {
  const { groups } = useStickers();
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setErr("");
    setF(sticker
      ? { label: sticker.label, zh: sticker.zh, prompt: sticker.prompt, prompt_no_ears: sticker.prompt_no_ears ?? "", bottom: sticker.align === "bottom", group: 0 }
      : { ...EMPTY, group: defaultGroup ?? 0 });
  }, [open, sticker, defaultGroup]);

  const ok = f.label.trim() && f.prompt.trim();
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const body = { label: f.label, zh: f.zh, prompt: f.prompt, prompt_no_ears: f.prompt_no_ears, align: f.bottom ? "bottom" : null };
      const s = sticker
        ? await api.patch<Sticker>(`/api/stickers/${sticker.id}`, body)
        : await api.post<Sticker>("/api/stickers", { ...body, group_id: f.group || null });
      await reloadStickers();
      onSaved?.(s);
      onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} label={sticker ? "編輯表情" : "新增表情"}>
      <div className="space-y-3">
        <h3 className="text-lg">{sticker ? <>編輯表情 #{sticker.id}<span className="ml-2 text-sm text-mute">檔名 {sticker.name}</span></> : "新增表情"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">英文名稱{sticker ? "" : "（也會變成檔名）"}</label>
            <input className="input" autoFocus placeholder="Sleepy Tea" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
          <div><label className="label">中文說明</label>
            <input className="input" placeholder="捧著茶杯打瞌睡" value={f.zh} onChange={(e) => setF({ ...f, zh: e.target.value })} /></div>
        </div>
        <div><label className="label">英文表情描述（會直接放進 prompt）</label>
          <textarea className="input h-20 resize-y font-mono text-xs leading-relaxed" placeholder="sleepy, holding a cup of tea with both hands, half-closed eyes"
            value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></div>
        <div><label className="label">沒有獸耳的角色改用這句（選填；描述裡提到耳朵、炸毛時建議填）</label>
          <textarea className="input h-16 resize-y font-mono text-xs leading-relaxed" placeholder="留空＝沿用上面那句"
            value={f.prompt_no_ears} onChange={(e) => setF({ ...f, prompt_no_ears: e.target.value })} /></div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-mute"><Check checked={f.bottom} onCheckedChange={(v) => setF({ ...f, bottom: v })} />輸出時貼齊底邊（像 Lurk 從下方探頭）</label>
          {!sticker && groups.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs text-mute">放進分組
              <Select<number> className="w-44" label="放進分組" value={f.group} onChange={(v) => setF({ ...f, group: v })}
                options={[{ value: 0, label: "不放（未分組）" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
            </div>
          )}
        </div>
        {sticker && <p className="text-[11px] text-mute">已經生成的成品不會變；改過的描述從下一次生成開始使用。</p>}
        {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          {sticker && onDelete && <DeleteButton onClick={() => onDelete(sticker)} disabled={busy} />}
          <button className="btn ml-auto" onClick={onClose} disabled={busy}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={!ok || busy}>
            {busy ? <><Spinner className="size-3.5 border-on-acc border-t-transparent" />儲存中</> : sticker ? "儲存" : "新增"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

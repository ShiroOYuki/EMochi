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
  const [idea, setIdea] = useState("");
  const [expanding, setExpanding] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErr(""); setIdea("");
    setF(sticker
      ? { label: sticker.label, zh: sticker.zh, prompt: sticker.prompt, prompt_no_ears: sticker.prompt_no_ears ?? "", bottom: sticker.align === "bottom", group: 0 }
      : { ...EMPTY, group: defaultGroup ?? 0 });
  }, [open, sticker, defaultGroup]);

  const ok = f.label.trim() && f.prompt.trim();
  /** 讓 Codex 把一句話擴寫成名稱／中文／prompt（短句，跟現有表情同風格）；結果填進表單，存不存由使用者決定 */
  const expand = async () => {
    setExpanding(true); setErr("");
    try {
      const d = await api.post<{ label: string; zh: string; prompt: string; prompt_no_ears: string; align: string | null }>(
        "/api/stickers/expand", { idea, label: f.label, zh: f.zh, prompt: f.prompt });
      // 編輯既有表情時保留原本的英文名稱（使用者通常只想改描述）
      setF((x) => ({ ...x, label: sticker && x.label.trim() ? x.label : d.label, zh: d.zh, prompt: d.prompt,
        prompt_no_ears: d.prompt_no_ears, bottom: d.align === "bottom" }));
    } catch (e) { setErr((e as Error).message); }
    finally { setExpanding(false); }
  };
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
    <Modal open={open} onClose={() => !busy && !expanding && onClose()} label={sticker ? "編輯表情" : "新增表情"}>
      <div className="space-y-3">
        <h3 className="text-lg">{sticker ? <>編輯表情 #{sticker.id}<span className="ml-2 text-sm text-mute">檔名 {sticker.name}</span></> : "新增表情"}</h3>
        <div className="rounded-2xl bg-panel2 p-3">
          <label className="label">用一句話描述想要的表情，讓 Codex 擴寫（中英文都可以；留空就用下面的中文說明）</label>
          <div className="flex gap-2">
            <input className="input bg-panel" autoFocus={!sticker} placeholder="例如：捧著茶杯打瞌睡" value={idea} disabled={expanding}
              onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !expanding) expand(); }} />
            <button className="btn shrink-0" onClick={expand} disabled={expanding || busy || !(idea.trim() || f.zh.trim() || f.label.trim())}>
              {expanding ? <><Spinner className="size-3.5" />擴寫中…</> : "✨ 擴寫"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-mute">{expanding ? "Codex 思考中，大約 10～30 秒" : "會參考現有表情的寫法，產生簡短的名稱、中文說明與英文描述，填進下面的欄位；滿意再按儲存"}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">英文名稱{sticker ? "" : "（也會變成檔名）"}</label>
            <input className="input" placeholder="Sleepy Tea" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
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
          <button className="btn btn-primary" onClick={save} disabled={!ok || busy || expanding}>
            {busy ? <><Spinner className="size-3.5 border-on-acc border-t-transparent" />儲存中</> : sticker ? "儲存" : "新增"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

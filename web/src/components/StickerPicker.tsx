import { useMemo, useState } from "react";
import { api, type Sticker } from "../api";

const GROUP_NAMES: Record<number, string> = { 1: "基礎情緒", 2: "反應表情", 3: "社群互動", 4: "Twitch / 迷因", 0: "自訂" };

/** 從貼圖清單勾選要生成的表情，也可以新增自訂表情 */
export default function StickerPicker({ stickers, value, onChange, onAdded, disabled, groupSize = 8 }: {
  groupSize?: number;
  stickers: Sticker[]; value: number[]; onChange: (ids: number[]) => void; onAdded: (s: Sticker) => void; disabled?: boolean;
}) {
  const sel = new Set(value);
  const groups = useMemo(() => {
    const m = new Map<number, Sticker[]>();
    for (const s of stickers) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return [...m.entries()].sort(([a], [b]) => (a || 99) - (b || 99));
  }, [stickers]);
  const toggle = (id: number) => onChange(sel.has(id) ? value.filter((x) => x !== id) : [...value, id].sort((a, b) => a - b));
  const setMany = (ids: number[], on: boolean) => {
    const next = new Set(value);
    ids.forEach((i) => (on ? next.add(i) : next.delete(i)));
    onChange([...next].sort((a, b) => a - b));
  };

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", zh: "", prompt: "", bottom: false });
  const [err, setErr] = useState("");
  const add = async () => {
    setErr("");
    try {
      const s = await api.post<Sticker>("/api/stickers", { label: form.label, zh: form.zh, prompt: form.prompt, align: form.bottom ? "bottom" : null });
      onAdded(s);
      onChange([...value, s.id]);
      setForm({ label: "", zh: "", prompt: "", bottom: false });
      setAdding(false);
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => onChange(stickers.map((s) => s.id))}>全選</button>
        <button className="btn btn-sm" onClick={() => onChange([])}>清空</button>
        <button className="btn btn-sm" onClick={() => setAdding((v) => !v)}>＋ 新增自訂表情</button>
        <span className="ml-auto text-xs text-mute">
          已選 {value.length} 張，會分成 {Math.ceil(value.length / groupSize)} 組生成（每組最多 {groupSize} 張）
        </span>
      </div>

      {adding && (
        <div className="mb-4 grid gap-2 rounded-2xl border border-line bg-panel2 p-4 sm:grid-cols-2">
          <div><label className="label">英文名稱（檔名用）</label><input className="input" placeholder="Sleepy Tea" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          <div><label className="label">中文說明</label><input className="input" placeholder="捧著茶杯打瞌睡" value={form.zh} onChange={(e) => setForm({ ...form, zh: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">英文表情描述（會直接放進 prompt）</label>
            <input className="input" placeholder="sleepy, holding a cup of tea with both hands, half-closed eyes" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-xs text-mute"><input type="checkbox" checked={form.bottom} onChange={(e) => setForm({ ...form, bottom: e.target.checked })} />輸出時貼齊底邊（像 Lurk 從下方探頭）</label>
          <div className="flex items-center justify-end gap-2">{err && <span className="text-xs text-bad">{err}</span>}
            <button className="btn btn-primary btn-sm" onClick={add} disabled={!form.label.trim() || !form.prompt.trim()}>加入清單</button></div>
        </div>
      )}

      <div className="space-y-3">
        {groups.map(([g, items]) => {
          const all = items.every((s) => sel.has(s.id));
          return (
            <div key={g}>
              <div className="mb-1.5 flex items-center gap-2 text-xs text-mute">
                <span className="text-text">{g ? `第 ${g} 組` : ""} {GROUP_NAMES[g] ?? ""}</span>
                <button className="text-acc hover:underline" onClick={() => setMany(items.map((s) => s.id), !all)}>{all ? "取消此組" : "全選此組"}</button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
                {items.map((s) => (
                  <label key={s.id} title={s.prompt}
                    className={`flex cursor-pointer items-start gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${sel.has(s.id) ? "border-pink bg-pink-soft" : "border-line bg-panel hover:border-mute"}`}>
                    <input type="checkbox" className="chk mt-0.5" checked={sel.has(s.id)} onChange={() => toggle(s.id)} />
                    <span className="min-w-0"><span className="block truncate">#{s.id} {s.label}</span>
                      <span className="block truncate text-mute">{s.zh}</span></span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

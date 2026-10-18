import { useCallback, useEffect, useRef, useState } from "react";
import { api, charImageUrl, readFiles, type Character, type Upload } from "../api";
import { DropZone, Section, Spinner } from "../components/ui";

/** 角色庫：每個角色是一個資料夾（characters/<id>/refs/ + character.json） */
export default function CharactersPage({ active }: { active: boolean }) {
  const [list, setList] = useState<Character[]>([]);
  const [current, setCurrent] = useState<string | null>(null);   // null = 新增角色
  const [newKey, setNewKey] = useState(0);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const l = await api.get<Character[]>("/api/characters");
    setList(l);
    return l;
  }, []);
  useEffect(() => {
    if (!active) return;
    load().then((l) => setCurrent((c) => (c === null && l.length && newKey === 0 ? l[0].id : c)));
  }, [active, load, newKey]);

  const act = async (fn: () => Promise<Character>) => {
    setErr("");
    try { const c = await fn(); await load(); setCurrent(c.id); return c; }
    catch (e) { setErr((e as Error).message); }
  };
  const char = list.find((c) => c.id === current) ?? null;

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-y-auto p-4">
        <button className={`btn mb-3 w-full ${current === null ? "btn-primary" : ""}`} onClick={() => { setCurrent(null); setNewKey((k) => k + 1); }}>＋ 新增角色</button>
        <div className="mb-1 px-1 text-xs text-mute">角色</div>
        {list.map((c) => {
          const cover = c.images.find((i) => i.use)?.file ?? c.images[0]?.file;
          return (
            <button key={c.id} onClick={() => setCurrent(c.id)}
              className={`mb-1.5 flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition ${current === c.id ? "border-acc bg-panel shadow-[var(--shadow-soft)]" : "border-transparent hover:bg-panel/70"}`}>
              {cover
                ? <img src={charImageUrl(c, cover)} className="checker size-10 rounded-xl object-cover" alt="" />
                : <span className="flex size-10 items-center justify-center rounded-xl bg-panel2 text-mute">?</span>}
              <span className="min-w-0">
                <span className="block truncate">{c.name}</span>
                <span className="text-[11px] text-mute">{c.id}・{c.images.length} 張圖</span>
              </span>
            </button>
          );
        })}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-4xl space-y-4">
          {err && <div className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</div>}
          {current === null || !char
            ? <NewCharacter focusKey={newKey} onCreate={(name, images) => act(() => api.post<Character>("/api/characters", { name, images }))} />
            : <CharacterView key={char.id} c={char} act={act} />}
        </div>
      </div>
    </div>
  );
}

function NewCharacter({ onCreate, focusKey }: { onCreate: (name: string, images: Upload[]) => Promise<unknown>; focusKey: number }) {
  const [name, setName] = useState("");
  const [images, setImages] = useState<Upload[]>([]);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusKey) box.current?.focus(); }, [focusKey]);
  const submit = async () => {
    setSaving(true);
    try { if (await onCreate(name, images)) { setName(""); setImages([]); } } finally { setSaving(false); }
  };
  return (
    <Section title="新增角色">
      <label className="label">角色名稱</label>
      <input ref={box} className="input max-w-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：黑貓店長" />
      <label className="label mt-4">角色參考圖（正面立繪、三視圖、表情都可以，之後也能再加）</label>
      <div className="flex flex-wrap gap-2">
        {images.map((u, i) => (
          <div key={i} className="checker relative size-28 overflow-hidden rounded-xl">
            <img src={u.data} className="size-full object-contain" alt={u.name} />
            <button onClick={() => setImages((x) => x.filter((_, j) => j !== i))} aria-label={`移除 ${u.name}`}
              className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-panel/90 text-xs shadow hover:text-bad">✕</button>
          </div>
        ))}
        <DropZone className="size-28" onFiles={async (f) => { const u = await readFiles(f); setImages((x) => [...x, ...u]); }} />
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {!name.trim() && <span className="text-xs text-mute">先取個名字</span>}
        <button className="btn btn-primary" disabled={!name.trim() || saving} onClick={submit}>{saving ? "建立中…" : "建立角色"}</button>
      </div>
    </Section>
  );
}

function CharacterView({ c, act }: { c: Character; act: (fn: () => Promise<Character>) => Promise<Character | undefined> }) {
  const [f, setF] = useState({ name: c.name, identity: c.identity });
  useEffect(() => setF({ name: c.name, identity: c.identity }), [c.name, c.identity]);
  const dirty = f.name !== c.name || f.identity !== c.identity;
  const [describing, setDescribing] = useState(false);
  const base = `/api/characters/${c.id}`;

  const describe = async () => {
    if (dirty && !confirm("Codex 寫的特徵會蓋掉目前沒儲存的修改，要繼續嗎？")) return;
    setDescribing(true);
    try { await act(() => api.post<Character>(`${base}/describe`)); } finally { setDescribing(false); }
  };

  return (
    <>
      <Section title="基本資料" right={<span className="text-xs text-mute">資料夾 characters/{c.id}/</span>}>
        <label className="label">角色名稱</label>
        <input className="input max-w-sm" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Section>

      <Section title="參考圖" right={<span className="text-xs text-mute">粉框＝新畫風預設會附上這張</span>}>
        <div className="flex flex-wrap gap-3">
          {c.images.map((i) => (
            <div key={i.file} className="w-32">
              <button onClick={() => act(() => api.patch<Character>(base, { use: { [i.file]: !i.use } }))} aria-pressed={i.use} title="切換是否預設附上"
                className={`checker block aspect-square w-full overflow-hidden rounded-xl border-[3px] transition ${i.use ? "border-pink" : "border-transparent opacity-50 hover:opacity-90"}`}>
                <img src={charImageUrl(c, i.file)} className="size-full object-contain" alt={i.file} />
              </button>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-mute">
                <span className="truncate" title={i.source ? `原檔名：${i.source}` : undefined}>{i.file.replace(/\.png$/, "")}</span>
                <button className="ml-auto shrink-0 hover:text-bad" onClick={() => act(() => api.del<Character>(`${base}/images/${encodeURIComponent(i.file)}`))}>移除</button>
              </div>
            </div>
          ))}
          <DropZone className="size-32" onFiles={async (files) => { const u = await readFiles(files); if (u.length) await act(() => api.post<Character>(`${base}/images`, u)); }} />
        </div>
        <p className="mt-2 text-[11px] text-mute">每個角色的檔名都是 ref_01、ref_02…，流水號不會重複使用；滑過檔名可看原檔名。移除的圖會移到 refs/_removed/，不會真的刪掉。圖片會轉成 PNG、長邊縮到 1536px。</p>
      </Section>

      <Section title="角色特徵句"
        right={<button className="btn btn-sm" disabled={!c.images.length || describing} onClick={describe}>
          {describing ? <span className="flex items-center gap-1.5"><Spinner className="size-3" />Codex 看圖中…</span> : "讓 Codex 看圖寫"}
        </button>}>
        <label className="label">英文，會放進每個 prompt 的「Character identity」段落，配合參考圖一起鎖住長相（髮色、耳朵、眼睛、飾品在哪一側…）</label>
        <textarea className="input h-28 resize-y font-mono text-xs leading-relaxed" value={f.identity}
          onChange={(e) => setF({ ...f, identity: e.target.value })} placeholder="Character identity to keep: ..." />
        {c.notes_zh && <p className="mt-2 text-xs text-mute">💡 {c.notes_zh}</p>}
        {describing && <p className="mt-2 text-xs text-mute">大約 30 秒～1 分鐘，可以先去別的分頁。</p>}
      </Section>

      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={!dirty || !f.name.trim()} onClick={() => act(() => api.patch<Character>(base, f))}>儲存修改</button>
      </div>
    </>
  );
}

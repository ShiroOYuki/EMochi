import { useCallback, useEffect, useRef, useState } from "react";
import { api, fileUrl, libCover, libImageUrl, readFiles, type Importable, type LibStyle, type Upload } from "../api";
import { DropZone, Section, Select, Spinner } from "../components/ui";
import { copyText, DeleteButton, DeleteConfirm, MenuIcons, SideDeleteIcon, TrashButton, useContextMenu, type DeleteTarget, type MenuItem } from "../components/manage";

/** 畫風庫：上傳範例貼圖 → Codex 分析畫風 → 存起來，Gen 新增畫風時可以直接套用 */
export default function StylesPage({ active }: { active: boolean }) {
  const [list, setList] = useState<LibStyle[]>([]);
  const [current, setCurrent] = useState<string | null>(null);   // null = 新增
  const [newKey, setNewKey] = useState(0);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const l = await api.get<LibStyle[]>("/api/style-lib");
    setList(l);
    return l;
  }, []);
  useEffect(() => {
    if (!active) return;
    load().then((l) => setCurrent((c) => (c === null && l.length && newKey === 0 ? l[0].id : c)));
  }, [active, load, newKey]);

  /** 執行後重新整理清單並切到回傳的畫風；回傳帶 error（分析失敗）時仍切過去並顯示錯誤 */
  const act = async (fn: () => Promise<LibStyle>) => {
    setErr("");
    try {
      const s = await fn(); await load(); setCurrent(s.id);
      if (s.error) setErr(s.error);
      return s;
    } catch (e) { setErr((e as Error).message); }
  };
  // 刪除：側欄垃圾桶圖示、右鍵選單、頁面內容的刪除鈕都走這裡（先跳確認框，移到垃圾桶）
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const [trashKey, setTrashKey] = useState(0);
  const askDelete = (s: LibStyle) => setToDelete({ id: s.id, title: s.name });
  const doDelete = async (id: string) => {
    await api.del(`/api/style-lib/${id}`);
    setTrashKey((k) => k + 1);
    const l = await load();
    if (current === id) setCurrent(l[0]?.id ?? null);
  };
  const [menu, openMenu] = useContextMenu();
  const menuFor = (s: LibStyle): MenuItem[] => [
    { label: "開啟", icon: MenuIcons.open, onSelect: () => setCurrent(s.id) },
    { label: `複製編號 ${s.id}`, icon: MenuIcons.copy, onSelect: () => copyText(s.id) },
    "sep",
    { label: "刪除", icon: MenuIcons.trash, danger: true, onSelect: () => askDelete(s) },
  ];
  const style = list.find((s) => s.id === current) ?? null;

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col">
        <div className="shrink-0 px-4 pt-4">
          <button className={`btn mb-3 w-full ${current === null ? "btn-primary" : ""}`} onClick={() => { setCurrent(null); setNewKey((k) => k + 1); }}>＋ 新增畫風</button>
          <div className="mb-1 px-1 text-xs text-mute">畫風庫</div>
        </div>
        <div className="side-list">
        {list.length === 0 && <div className="px-1 text-xs text-mute">還沒有畫風。上傳範例貼圖讓 Codex 分析，或從現有的畫風專案匯入。</div>}
        {list.map((s) => {
          const cover = libCover(s);
          return (
            <div key={s.id} className="group relative mb-1.5" onContextMenu={(e) => openMenu(e, menuFor(s))}>
            <button onClick={() => setCurrent(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 pr-9 text-left transition ${current === s.id ? "border-acc bg-panel shadow-[var(--shadow-soft)]" : "border-transparent hover:bg-panel/70"}`}>
              {cover
                ? <img src={libImageUrl(s, cover)} className="checker size-10 rounded-xl object-cover" alt="" />
                : <span className="flex size-10 items-center justify-center rounded-xl bg-panel2 text-mute">?</span>}
              <span className="min-w-0">
                <span className="block truncate">{s.name || "（未命名）"}</span>
                <span className="text-[11px] text-mute">{s.id}{s.source_project ? `・來自 ${s.source_project}` : ""}{!s.style_block && "・待分析"}</span>
              </span>
            </button>
            <SideDeleteIcon onClick={() => askDelete(s)} label={`刪除畫風 ${s.id}`} shown={current === s.id} />
            </div>
          );
        })}
        </div>
        {menu}
        <DeleteConfirm target={toDelete} noun="畫風" onConfirm={doDelete} onClose={() => setToDelete(null)} />
        <TrashButton kind="styles" active={active} refreshKey={trashKey}
          onRestored={(id) => { load(); setCurrent(id); }} />
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-4xl space-y-4">
          {err && <div className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</div>}
          {current === null || !style
            ? <>
                <NewStyle focusKey={newKey} onCreate={(body) => act(() => api.post<LibStyle>("/api/style-lib", body))} />
                <ImportSection active={active && current === null} onImport={(project) => act(() => api.post<LibStyle>("/api/style-lib/import", { project }))} />
              </>
            : <StyleView key={style.id} s={style} act={act} onRemove={() => askDelete(style)} />}
        </div>
      </div>
    </div>
  );
}

type NewBody = { name: string; request: string; images: Upload[]; analyze: boolean };

function NewStyle({ onCreate, focusKey }: { onCreate: (b: NewBody) => Promise<LibStyle | undefined>; focusKey: number }) {
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  const [images, setImages] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const drop = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focusKey) drop.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [focusKey]);
  const submit = async (analyze: boolean) => {
    setBusy(analyze);
    try { if (await onCreate({ name, request, images, analyze })) { setName(""); setRequest(""); setImages([]); } }
    finally { setBusy(false); }
  };
  return (
    <Section title="從範例貼圖分析畫風">
      <p className="mb-3 text-sm text-mute">放幾張想模仿的貼圖（同一種畫風，1～4 張最好），Codex 只看「畫法」——線條、上色、比例、表情怎麼畫——不管圖裡畫的是誰。</p>
      <div ref={drop} className="flex flex-wrap gap-2">
        {images.map((u, i) => (
          <div key={i} className="checker relative size-28 overflow-hidden rounded-xl">
            <img src={u.data} className="size-full object-contain" alt={u.name} />
            <button onClick={() => setImages((x) => x.filter((_, j) => j !== i))} aria-label={`移除 ${u.name}`}
              className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-panel/90 text-xs shadow hover:text-bad">✕</button>
          </div>
        ))}
        <DropZone className="size-28" disabled={busy} onFiles={async (f) => { const u = await readFiles(f); setImages((x) => [...x, ...u]); }} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
        <div><label className="label">畫風名稱（可空，Codex 會取）</label>
          <input className="input" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="例如：黏土公仔" /></div>
        <div><label className="label">補充說明（可空；和圖不一致時以文字為準）</label>
          <input className="input" value={request} disabled={busy} onChange={(e) => setRequest(e.target.value)} placeholder="例如：線條再粗一點、不要漸層" /></div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {busy && <span className="flex items-center gap-1.5 text-xs text-mute"><Spinner className="size-3" />Codex 看圖中，大約 30 秒～1 分鐘…</span>}
        {!images.length && <span className="text-xs text-mute">先放至少一張範例貼圖</span>}
        <button className="btn" disabled={!images.length || busy} onClick={() => submit(false)} title="先存起來，之後再分析">只建立</button>
        <button className="btn btn-primary" disabled={!images.length || busy} onClick={() => submit(true)}>建立並分析</button>
      </div>
    </Section>
  );
}

function ImportSection({ active, onImport }: { active: boolean; onImport: (project: string) => Promise<LibStyle | undefined> }) {
  const [items, setItems] = useState<Importable[]>([]);
  useEffect(() => { if (active) api.get<Importable[]>("/api/style-lib/importable").then(setItems).catch(() => {}); }, [active]);
  if (!items.length) return null;
  return (
    <Section title="從現有的畫風專案匯入">
      <p className="mb-3 text-sm text-mute">把 s1、s2… 的畫風描述存進畫風庫，範例圖用該專案自己生出來的網格圖。</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((o) => (
          <div key={o.id} className="rounded-2xl border border-line bg-panel p-2">
            {o.image
              ? <img src={fileUrl(o.image)} className="aspect-square w-full rounded-xl bg-panel2 object-contain" alt="" />
              : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-panel2 text-xs text-mute">沒有圖</div>}
            <div className="mt-1.5 truncate text-sm">{o.id}<span className="ml-1.5 text-xs text-mute">{o.name}</span></div>
            {o.needs_analyze && <div className="text-[11px] text-mute">沒有文字描述，匯入後再分析</div>}
            <button className="btn btn-sm mt-1.5 w-full" onClick={() => onImport(o.id)}>{o.imported ? "再匯入一份" : "匯入"}</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StyleView({ s, act, onRemove }: { s: LibStyle; act: (fn: () => Promise<LibStyle>) => Promise<LibStyle | undefined>; onRemove: () => void }) {
  const pick = (x: LibStyle) => ({ name: x.name, request: x.request, framing: x.framing, style_block: x.style_block, square: x.process.square, margin: x.process.margin });
  const [f, setF] = useState(pick(s));
  useEffect(() => setF(pick(s)), [s.updated]);   // eslint-disable-line react-hooks/exhaustive-deps
  const orig = pick(s);
  const dirty = (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k] !== orig[k]);
  const [analyzing, setAnalyzing] = useState(false);
  const base = `/api/style-lib/${s.id}`;
  const body = () => ({ name: f.name, request: f.request, framing: f.framing, style_block: f.style_block, process: { square: f.square, margin: f.margin } });
  const setFraming = (framing: "closeup" | "whole") =>
    setF({ ...f, framing, square: framing === "closeup" ? 0.5 : null, margin: framing === "closeup" ? 0 : 0.04 });
  const analyze = async () => {
    if (s.style_block && !confirm("Codex 寫的描述會蓋掉目前的畫風描述，要繼續嗎？")) return;
    setAnalyzing(true);
    try { await act(() => api.post<LibStyle>(`${base}/analyze`, { request: f.request })); } finally { setAnalyzing(false); }
  };
  const used = s.images.filter((i) => i.use).length;

  return (
    <>
      <Section title="範例貼圖" right={<span className="text-xs text-mute">粉框＝分析與套用時會附上</span>}>
        <div className="flex flex-wrap gap-3">
          {s.images.map((i) => (
            <div key={i.file} className="w-32">
              <button onClick={() => act(() => api.patch<LibStyle>(base, { use: { [i.file]: !i.use } }))} aria-pressed={i.use} title="切換是否附上"
                className={`checker block aspect-square w-full overflow-hidden rounded-xl border-[3px] transition ${i.use ? "border-pink" : "border-transparent opacity-50 hover:opacity-90"}`}>
                <img src={libImageUrl(s, i.file)} className="size-full object-contain" alt={i.file} />
              </button>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-mute">
                <span className="truncate" title={i.source ? `原檔名：${i.source}` : undefined}>{i.file.replace(/\.png$/, "")}</span>
                <button className="ml-auto shrink-0 hover:text-bad" onClick={() => act(() => api.del<LibStyle>(`${base}/images/${encodeURIComponent(i.file)}`))}>移除</button>
              </div>
            </div>
          ))}
          <DropZone className="size-32" onFiles={async (files) => { const u = await readFiles(files); if (u.length) await act(() => api.post<LibStyle>(`${base}/images`, u)); }} />
        </div>
      </Section>

      <Section title="畫風描述"
        right={<button className="btn btn-sm" disabled={!used || analyzing} onClick={analyze}>
          {analyzing ? <span className="flex items-center gap-1.5"><Spinner className="size-3" />Codex 看圖中…</span> : s.style_block ? "重新分析" : "讓 Codex 分析"}
        </button>}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_200px]">
          <div><label className="label">畫風名稱</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label">補充說明（分析時一起給 Codex）</label><input className="input" value={f.request} onChange={(e) => setF({ ...f, request: e.target.value })} /></div>
          <div><label className="label">構圖</label>
            <Select<"closeup" | "whole"> label="構圖" value={f.framing} onChange={setFraming}
              options={[{ value: "closeup", label: "特寫（臉塞滿、邊緣裁切）" }, { value: "whole", label: "整顆入鏡（如麻糬）" }]} /></div>
        </div>
        <div className="mt-3"><label className="label">英文畫風描述（會放進 prompt 的 Art style 段落）</label>
          <textarea className="input h-48 resize-y font-mono text-xs leading-relaxed" value={f.style_block}
            onChange={(e) => setF({ ...f, style_block: e.target.value })} placeholder={used ? "按右上角「讓 Codex 分析」，或自己寫" : "先勾選至少一張範例貼圖"} /></div>
        {s.notes_zh && <p className="mt-2 text-xs text-mute">💡 {s.notes_zh}</p>}
        {analyzing && <p className="mt-2 text-xs text-mute">大約 30 秒～1 分鐘，可以先去別的分頁。</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-mute">
          <span>後處理：{f.square === null ? "不裁切" : `裁成正方形（上方比例 ${f.square}）`}、留白 {f.margin}</span>
          <span>・{s.id}{s.source_project ? `，匯入自 ${s.source_project}` : ""}</span>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <DeleteButton onClick={onRemove} title="移到垃圾桶" />
        <span className="ml-auto text-xs text-mute">{s.style_block ? "到 Gen 分頁「新增畫風」就能選這個畫風" : "分析完才能在 Gen 使用"}</span>
        <button className="btn btn-primary" disabled={!dirty} onClick={() => act(() => api.patch<LibStyle>(base, body()))}>儲存修改</button>
      </div>
    </>
  );
}

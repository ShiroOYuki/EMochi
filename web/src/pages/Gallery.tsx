import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fileUrl, type GalleryItem, type GalleryStyle, type SelectionInfo } from "../api";
import { Modal } from "../components/ui";

const FMT: Record<string, string> = { master: "Master 512", t112: "Twitch 112", t56: "Twitch 56", t28: "Twitch 28", discord: "Discord 128" };
const KIND: Record<string, string> = { export: "匯出", combine: "組合", selection: "勾選" };
type Entry = { s: GalleryStyle; it: GalleryItem };
const keyOf = (e: Entry) => `${e.s.id}:${e.it.id}`;

function useStored<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : init; } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 私密模式等情況忽略 */ } }, [key, v]);
  return [v, setV] as const;
}

export default function GalleryPage({ active }: { active: boolean }) {
  const [styles, setStyles] = useState<GalleryStyle[]>([]);
  const [mode, setMode] = useStored<string>("gallery.mode", "__all");
  const [group, setGroup] = useState(0);
  const [selArr, setSelArr] = useStored<string[]>("gallery.sel", []);
  const sel = useMemo(() => new Set(selArr), [selArr]);
  const [open, setOpen] = useState<number | null>(null);

  const reload = useCallback(async () => setStyles(await api.get<GalleryStyle[]>("/api/gallery")), []);
  useEffect(() => { if (active) reload(); }, [active, reload]);

  const ok = (it: GalleryItem) => !group || (group === 5 ? it.id > 32 : it.group === group);
  // 單一畫風：該畫風全部；並排比較：依貼圖編號分組
  const { view, rows } = useMemo(() => {
    if (mode !== "__all") {
      const s = styles.find((x) => x.id === mode) ?? styles[0];
      const v = s ? s.items.filter(ok).map((it) => ({ s, it })) : [];
      return { view: v, rows: null as null | { id: number; entries: Entry[] }[] };
    }
    const ids = [...new Set(styles.flatMap((s) => s.items.filter(ok).map((i) => i.id)))].sort((a, b) => a - b);
    const rs = ids.map((id) => ({ id, entries: styles.flatMap((s) => { const it = s.items.find((x) => x.id === id); return it ? [{ s, it }] : []; }) }));
    return { view: rs.flatMap((r) => r.entries), rows: rs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, mode, group]);

  const setSel = (keys: string[], on: boolean) => {
    const next = new Set(selArr);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    setSelArr([...next]);
  };
  const toggle = (k: string) => setSel([k], !sel.has(k));

  useEffect(() => {
    if (open === null) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setOpen((i) => (i! - 1 + view.length) % view.length);
      if (e.key === "ArrowRight") setOpen((i) => (i! + 1) % view.length);
      if (e.key === " ") { e.preventDefault(); toggle(keyOf(view[open])); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const card = (e: Entry, i: number) => {
    const k = keyOf(e), on = sel.has(k);
    return (
      <div key={k} onClick={() => setOpen(i)}
        className={`relative w-[136px] cursor-pointer rounded-[20px] border-2 p-2.5 pt-3 text-center transition ${on ? "sticker-on border-pink bg-pink-soft" : "border-transparent bg-panel2 hover:border-line"}`}>
        <button aria-label={on ? "取消勾選" : "勾選"} onClick={(ev) => { ev.stopPropagation(); toggle(k); }}
          className={`absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-full border-2 text-xs transition ${on ? "border-pink bg-pink text-white" : "border-line bg-panel text-transparent hover:border-pink"}`}>✓</button>
        <span className="absolute right-2 top-2 z-10 rounded-full bg-panel px-2 text-[11px] text-mute">{mode === "__all" ? e.s.id : `#${e.it.id}`}</span>
        <img loading="lazy" src={fileUrl(`outputs/${e.it.files.t112 ?? e.it.files.master}`, e.it.mtime)} className="sticker-img mx-auto mb-1.5 size-28" />
        <div className="truncate text-xs text-mute">{mode === "__all" ? e.s.name || e.s.id : e.it.label}</div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button className={`btn btn-sm ${mode === "__all" ? "btn-primary" : ""}`} onClick={() => setMode("__all")}>並排比較（全部版本）</button>
        {styles.map((s) => (
          <button key={s.id} title={s.name} className={`btn btn-sm ${mode === s.id ? "btn-primary" : ""}`} onClick={() => setMode(s.id)}>
            {s.id}<span className={mode === s.id ? "text-white/75" : "text-mute"}>（{s.items.length}）</span>
          </button>
        ))}
        <select className="input !w-32 !py-1" value={group} onChange={(e) => setGroup(+e.target.value)}>
          <option value={0}>全部組別</option>{[1, 2, 3, 4].map((g) => <option key={g} value={g}>第 {g} 組</option>)}<option value={5}>自訂表情</option>
        </select>
        <button className="btn btn-sm" onClick={() => setSel(view.map(keyOf), true)}>全選此頁</button>
        <button className="btn btn-sm" onClick={() => setSel(view.map(keyOf), false)}>取消此頁</button>
        <button className="btn btn-sm" onClick={() => setSelArr(view.map(keyOf).filter((k) => !sel.has(k)).concat(selArr.filter((k) => !view.some((e) => keyOf(e) === k))))}>反選此頁</button>
        <button className="btn btn-sm" onClick={() => setSelArr([])}>清空全部</button>
        <button className="btn btn-sm" onClick={reload}>重新整理</button>
        <span className="ml-auto text-sm text-mute">已勾選 {sel.size} 張</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {styles.length === 0 && <p className="text-mute">還沒有成品。到 Gen 分頁完成一套畫風後就會出現在這裡。</p>}
          {rows ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(300, styles.length * 142 + 24)}px, 1fr))` }}>
              {rows.map((r) => {
                const it0 = r.entries[0].it, start = view.indexOf(r.entries[0]);
                const keys = r.entries.map(keyOf);
                return (
                  <div key={r.id} className="rounded-[22px] bg-panel p-3.5 shadow-[var(--shadow-soft)]">
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span>#{r.id} {it0.label}</span><span className="text-xs text-mute">{it0.zh}</span>
                      <button className="btn btn-sm ml-auto" onClick={() => setSel(keys, true)}>全選此組</button>
                      <button className="btn btn-sm" onClick={() => setSel(keys, false)}>取消此組</button>
                    </div>
                    <div className="flex flex-wrap gap-2.5">{r.entries.map((e, j) => card(e, start + j))}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">{view.map(card)}</div>
          )}
        </div>
        <SidePanel sel={selArr} setSel={setSelArr} styles={styles} />
      </div>

      <Modal open={open !== null && !!view[open]} onClose={() => setOpen(null)}>
        {open !== null && view[open] && <Preview e={view[open]} on={sel.has(keyOf(view[open]))} onToggle={() => toggle(keyOf(view[open]))}
          onPrev={() => setOpen((open - 1 + view.length) % view.length)} onNext={() => setOpen((open + 1) % view.length)} />}
      </Modal>
    </div>
  );
}

function Preview({ e, on, onToggle, onPrev, onNext }: { e: Entry; on: boolean; onToggle: () => void; onPrev: () => void; onNext: () => void }) {
  const f = e.it.files;
  const sizes = (bg: string) => (
    <div className={`flex items-center gap-3 rounded-lg p-3 ${bg}`}>
      {(["t112", "t56", "t28"] as const).filter((k) => f[k]).map((k) => {
        const px = +k.slice(1);
        return <img key={k} src={fileUrl(`outputs/${f[k]}`, e.it.mtime)} style={{ width: px, height: px }} />;
      })}
    </div>
  );
  return (
    <>
      <h3 className="mb-3">{e.s.id} #{e.it.id} {e.it.label}<span className="ml-2 text-sm font-normal text-mute">{e.it.zh}</span></h3>
      <div className="flex flex-wrap items-start gap-5">
        <img src={fileUrl(`outputs/${f.master}`, e.it.mtime)} className="checker size-64 rounded-lg" />
        <div className="space-y-2">{sizes("bg-[#313338]")}{sizes("bg-white border border-line")}<p className="text-xs text-mute">實際尺寸 112 / 56 / 28（Discord 深色、白色背景）</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button className="btn" onClick={onPrev}>上一張</button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="chk" checked={on} onChange={onToggle} />勾選這張（空白鍵）</label>
        <button className="btn" onClick={onNext}>下一張</button>
      </div>
    </>
  );
}

// ---------- 右側：勾選清單 / 匯出 / 組合 ----------

function SidePanel({ sel, setSel, styles }: { sel: string[]; setSel: (k: string[]) => void; styles: GalleryStyle[] }) {
  const [fmts, setFmts] = useStored<string[]>("gallery.fmts", ["t112", "t56", "t28", "discord"]);
  const [tag, setTag] = useStored("gallery.tag", "");
  const [cmb, setCmb] = useStored("gallery.combine", { cols: 8, cell: 128, gap: 8, bg: "transparent", labels: false });
  const [list, setList] = useState<SelectionInfo[]>([]);
  const [pick, setPick] = useState("");
  const [merge, setMerge] = useState(false);
  const [msg, setMsg] = useState({ sel: "", exp: "", cmb: "" });
  const [sheet, setSheet] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const l = await api.get<SelectionInfo[]>("/api/gallery/selections");
    setList(l); setPick((p) => p || l[0]?.file || "");
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const cleanTag = tag.replace(/[^A-Za-z0-9_-]/g, "");
  const say = (k: keyof typeof msg, v: string) => setMsg((m) => ({ ...m, [k]: v }));

  const apply = (d: Record<string, unknown>, src: string) => {
    const keys = (d.keys as string[] | undefined) ?? ((d.items as { key: string }[] | undefined) ?? []).map((i) => i.key);
    const valid = new Set(styles.flatMap((s) => s.items.map((it) => `${s.id}:${it.id}`)));
    const okKeys = keys.filter((k) => valid.has(k));
    setSel(merge ? [...new Set([...sel, ...okKeys])] : okKeys);
    if (Array.isArray(d.formats)) setFmts(d.formats as string[]);
    const t = (d.tag as string) ?? (typeof d.version === "string" ? d.version : null);
    if (typeof t === "string") setTag(t);
    if (d.combine) setCmb({ ...cmb, ...(d.combine as object) });
    const miss = keys.length - okKeys.length;
    say("sel", `已從 ${src} 載入 ${okKeys.length} 張${miss ? `（${miss} 張找不到，已略過）` : ""}`);
  };

  return (
    <aside className="m-3 ml-0 w-80 shrink-0 space-y-4 overflow-y-auto rounded-[22px] bg-panel p-5 text-sm shadow-[var(--shadow-soft)]">
      <div>
        <h3 className="mb-2">勾選清單（JSON）</h3>
        <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
          {list.length === 0 && <option value="">（還沒有存過的清單）</option>}
          {list.map((x) => <option key={x.file} value={x.file}>{x.created || x.file}（{KIND[x.kind] ?? "清單"}，{x.count} 張{x.tag ? `，${x.tag}` : ""}）</option>)}
        </select>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="btn" disabled={!pick} onClick={async () => apply(await api.get(`/api/gallery/selections/${encodeURIComponent(pick)}`), pick)}>載入勾選</button>
          <button className="btn" disabled={!sel.length} onClick={async () => {
            const r = await api.post<{ file: string }>("/api/gallery/selections", { keys: sel, formats: fmts, combine: cmb, tag: cleanTag });
            say("sel", `已存成 exports\\${r.file}`); loadList();
          }}>儲存目前勾選</button>
        </div>
        <label className="btn mt-2 w-full cursor-pointer">從檔案讀取…
          <input type="file" accept=".json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { apply(JSON.parse(await f.text()), f.name); } catch (err) { say("sel", `JSON 格式錯誤：${(err as Error).message}`); }
            e.target.value = "";
          }} /></label>
        <label className="mt-2 flex items-center gap-2 text-xs text-mute"><input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />載入時加到現有勾選（不取代）</label>
        <p className="mt-1 text-xs text-mute">{msg.sel || "每次匯出、組合也會自動存一份 JSON"}</p>
      </div>

      <hr className="border-line" />
      <div>
        <h3 className="mb-2">匯出（ZIP）</h3>
        {Object.entries(FMT).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" className="chk" checked={fmts.includes(k)} onChange={(e) => setFmts(e.target.checked ? [...fmts, k] : fmts.filter((x) => x !== k))} />{v}
          </label>
        ))}
        <div className="mt-2 flex items-center gap-2"><span className="shrink-0">版本標記</span>
          <input className="input" placeholder="選填，如 v1" maxLength={20} value={tag} onChange={(e) => setTag(e.target.value)} /></div>
        <p className="mt-1 text-xs text-mute">檔名範例：01_happy_s1{cleanTag ? `_${cleanTag}` : ""}.png</p>
        <button className="btn btn-primary mt-2 w-full" disabled={!sel.length || !fmts.length} onClick={async () => {
          say("exp", "匯出中…");
          try {
            const r = await api.post<{ file: string; count: number }>("/api/gallery/export", { keys: sel, formats: fmts, tag: cleanTag });
            say("exp", `完成：${r.count} 個檔案，存在 exports\\${r.file}`); location.href = fileUrl(`exports/${r.file}`); loadList();
          } catch (e) { say("exp", `失敗：${(e as Error).message}`); }
        }}>匯出勾選的 {sel.length} 張</button>
        {msg.exp && <p className="mt-1 break-all text-xs text-mute">{msg.exp}</p>}
      </div>

      <hr className="border-line" />
      <div>
        <h3 className="mb-2">組合成一張圖</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="label">欄數<input className="input mt-1" type="number" min={1} max={32} value={cmb.cols} onChange={(e) => setCmb({ ...cmb, cols: +e.target.value })} /></label>
          <label className="label">格子 px<select className="input mt-1" value={cmb.cell} onChange={(e) => setCmb({ ...cmb, cell: +e.target.value })}>{[56, 112, 128, 256, 512].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="label">間距 px<input className="input mt-1" type="number" min={0} max={64} value={cmb.gap} onChange={(e) => setCmb({ ...cmb, gap: +e.target.value })} /></label>
          <label className="label">背景<select className="input mt-1" value={cmb.bg} onChange={(e) => setCmb({ ...cmb, bg: e.target.value })}>
            <option value="transparent">透明</option><option value="dark">Discord 深色</option><option value="light">白色</option></select></label>
        </div>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" className="chk" checked={cmb.labels} onChange={(e) => setCmb({ ...cmb, labels: e.target.checked })} />顯示名稱</label>
        <button className="btn mt-2 w-full" disabled={!sel.length} onClick={async () => {
          say("cmb", "組合中…");
          try { const r = await api.post<{ file: string }>("/api/gallery/combine", { keys: sel, ...cmb }); say("cmb", `完成，存在 exports\\${r.file}`); setSheet(r.file); loadList(); }
          catch (e) { say("cmb", `失敗：${(e as Error).message}`); }
        }}>組合勾選的貼圖</button>
        {msg.cmb && <p className="mt-1 break-all text-xs text-mute">{msg.cmb}</p>}
        {sheet && <a href={fileUrl(`exports/${sheet}`, sheet)} download><img src={fileUrl(`exports/${sheet}`, sheet)} className="checker mt-2 rounded-md" /></a>}
      </div>
      <p className="text-xs text-mute">所有檔案也會存到專案的 exports\ 資料夾</p>
    </aside>
  );
}

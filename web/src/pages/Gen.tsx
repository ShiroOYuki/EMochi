import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, BUSY, fileUrl, readFiles, type Character, type Group, type Project, type ProjectSummary, type RefRole, type Sticker, type Upload } from "../api";
import { Elapsed, Modal, Section, Spinner, StatusBadge } from "../components/ui";
import StickerPicker from "../components/StickerPicker";
import RefPicker, { type TempRef } from "../components/RefPicker";

type ProjectsResp = { projects: ProjectSummary[]; next_id: string; preview_ids: number[]; max_parallel: number };

export default function GenPage({ onOpenGallery, active }: { onOpenGallery: () => void; active: boolean }) {
  const [list, setList] = useState<ProjectsResp | null>(null);
  const [current, setCurrent] = useState<string | null>(null);   // null = 新增畫風
  const [project, setProject] = useState<Project | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [err, setErr] = useState("");
  const [newKey, setNewKey] = useState(0);   // 每按一次「新增畫風」+1，讓表單聚焦並閃一下
  const [chars, setChars] = useState<Character[]>([]);
  // 切回這頁就重抓角色（可能剛在「角色」分頁新增或改過）
  useEffect(() => { if (active) api.get<Character[]>("/api/characters").then(setChars).catch(() => {}); }, [active]);

  const loadList = useCallback(async () => setList(await api.get<ProjectsResp>("/api/projects")), []);
  const loadProject = useCallback(async (id: string) => setProject(await api.get<Project>(`/api/projects/${id}`)), []);

  useEffect(() => { loadList(); api.get<Sticker[]>("/api/stickers").then(setStickers); }, [loadList]);
  useEffect(() => { setProject(null); setErr(""); if (current) loadProject(current); }, [current, loadProject]);

  // 執行中時輪詢
  const busy = project && BUSY.includes(project.status);
  useEffect(() => {
    if (!busy || !current) return;
    const t = setInterval(() => { loadProject(current); loadList(); }, 2500);
    return () => clearInterval(t);
  }, [busy, current, loadProject, loadList]);

  /** 呼叫會改變專案狀態的 API，成功後更新畫面 */
  const act = async (fn: () => Promise<Project>) => {
    setErr("");
    try { const p = await fn(); setProject(p); setCurrent(p.id); loadList(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-y-auto p-4">
        <button className={`btn mb-3 w-full ${current === null ? "btn-primary" : ""}`} onClick={() => { setCurrent(null); setNewKey((k) => k + 1); }}>＋ 新增畫風</button>
        <div className="mb-1 px-1 text-xs text-mute">畫風專案</div>
        {list?.projects.length === 0 && <div className="px-1 text-xs text-mute">還沒有專案，在右邊描述第一個畫風就會出現在這裡</div>}
        {list?.projects.map((p) => (
          <button key={p.id} onClick={() => setCurrent(p.id)}
            className={`mb-1.5 block w-full rounded-2xl border px-3 py-2.5 text-left transition ${current === p.id ? "border-acc bg-panel shadow-[var(--shadow-soft)]" : "border-transparent hover:bg-panel/70"}`}>
            <div className="flex items-center gap-2"><span >{p.id}</span><span className="truncate text-xs text-mute">{p.name}</span></div>
            {p.character_id && <div className="mt-0.5 truncate text-[11px] text-mute">角色：{chars.find((c) => c.id === p.character_id)?.name ?? p.character_id}</div>}
            <div className="mt-1"><StatusBadge status={p.status} /></div>
          </button>
        ))}
        <p className="mt-4 px-1 text-[11px] leading-relaxed text-mute">s1～s5 是在這個工具之前做的，沒有專案紀錄，但都已經在 Gallery 裡。</p>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-6xl space-y-4">
          {err && <div className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</div>}
          {current === null
            ? <NewProject focusKey={newKey} nextId={list?.next_id} chars={chars} onCreate={(body) => act(() => api.post<Project>("/api/projects", body))} />
            : project
              ? <ProjectView p={project} stickers={stickers} act={act} setStickers={setStickers} chars={chars}
                  previewIds={list?.preview_ids ?? []} maxParallel={list?.max_parallel ?? 3} onOpenGallery={onOpenGallery} />
              : <div className="flex items-center gap-2 text-mute"><Spinner />載入中…</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- 0. 新增 ----------

type CreateBody = { request: string; character_id: string | null; character_images: string[] | null; temp_refs: Upload[] };

function NewProject({ nextId, onCreate, focusKey, chars }: { nextId?: string; onCreate: (b: CreateBody) => void; focusKey: number; chars: Character[] }) {
  const [text, setText] = useState("");
  // 角色：預設選第一個（原角色）；undefined = 還沒動過
  const [pick, setPick] = useState<{ id: string | null; images: string[] | null } | undefined>();
  const charSel = pick ?? { id: chars[0]?.id ?? null, images: null };
  const [temp, setTemp] = useState<(TempRef & { data: string })[]>([]);
  const addTemp = async (files: File[]) => {
    const ups = await readFiles(files);
    setTemp((t) => [...t, ...ups.map((u, i) => ({ key: `${Date.now()}_${i}`, url: u.data, data: u.data, name: u.name, role: "character" as RefRole }))]);
  };
  const hasStyleRef = temp.some((t) => t.role === "style");
  const submit = () => onCreate({
    request: text, character_id: charSel.id, character_images: charSel.images,
    temp_refs: temp.map((t) => ({ name: t.name, data: t.data, role: t.role })),
  });
  const [flash, setFlash] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // 按「新增畫風」時：聚焦輸入框並短暫亮起，讓人知道表單在這裡（就算本來就在顯示）
  useEffect(() => {
    if (!focusKey) return;
    box.current?.focus();
    box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [focusKey]);
  const examples = ["黏土公仔風，霧面質感、圓潤立體", "美式卡通粗線條，表情誇張，適合迷因", "貼紙風，角色外圍一圈粗白邊", "水彩繪本風，柔和暈染"];
  return (
    <Section title={`新增畫風${nextId ? `（將建立 ${nextId}）` : ""}`} step={1}>
      <label className="label">用中文描述想要的畫風，Codex 會把它擴寫成英文畫風描述，再套進固定模板（網格、綠幕、角色特徵）</label>
      <textarea ref={box} className={`input h-28 resize-y transition-shadow ${flash ? "border-pink ring-4 ring-pink/30" : ""}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="例如：像日本動畫截圖的賽璐珞上色，陰影硬邊，眼睛有亮點…" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {examples.map((e) => <button key={e} className="btn btn-sm" onClick={() => setText(e)}>{e}</button>)}
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="mb-2 text-sm">參考圖</h3>
        <RefPicker characters={chars} characterId={charSel.id} characterImages={charSel.images}
          onCharacter={(id, images) => setPick({ id, images })}
          temp={temp} onAddTemp={addTemp}
          onTempRole={(key, role) => setTemp((t) => t.map((x) => (x.key === key ? { ...x, role } : x)))}
          onRemoveTemp={(key) => setTemp((t) => t.filter((x) => x.key !== key))} />
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {!text.trim() && !hasStyleRef && <span className="text-xs text-mute">先寫下想要的畫風、點一個範例，或上傳一張「畫風」參考圖</span>}
        <button className="btn btn-primary" disabled={!text.trim() && !hasStyleRef} onClick={submit}>交給 Codex 擴寫</button>
      </div>
    </Section>
  );
}

// ---------- 專案 ----------

type ViewProps = {
  p: Project; stickers: Sticker[]; act: (fn: () => Promise<Project>) => Promise<void>;
  setStickers: React.Dispatch<React.SetStateAction<Sticker[]>>; previewIds: number[]; maxParallel: number; onOpenGallery: () => void;
  chars: Character[];
};

function ProjectView({ p, stickers, act, setStickers, previewIds, maxParallel, onOpenGallery, chars }: ViewProps) {
  const stage = { expanding: 1, draft: 1, previewing: 2, preview_ready: 3, generating: 4, review: 4, processing: 5, done: 5 }[p.status];
  const steps = ["描述畫風", "風格預覽", "選擇貼圖", "生成與審核", "放入 Gallery"];
  const byId = useMemo(() => new Map(stickers.map((s) => [s.id, s])), [stickers]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg">{p.id}<span className="ml-2 text-base font-normal text-mute">{p.name || "（未命名）"}</span></h2>
        <StatusBadge status={p.status} />
        <ol className="ml-auto flex flex-wrap gap-1 text-xs">
          {steps.map((s, i) => (
            <li key={s} className={`rounded-full px-2.5 py-1 ${i + 1 < stage ? "bg-ok/15 text-ok" : i + 1 === stage ? "bg-gold text-on-gold" : "bg-panel text-mute"}`}>{i + 1}. {s}</li>
          ))}
        </ol>
      </div>
      {p.error && <div className="rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn">{p.error}</div>}

      <StyleStep p={p} act={act} chars={chars} />
      <PreviewStep p={p} act={act} previewIds={previewIds} byId={byId} />
      {(p.status === "preview_ready" || p.groups.length > 0) &&
        <PickStep p={p} act={act} stickers={stickers} setStickers={setStickers} maxParallel={maxParallel} />}
      {p.groups.length > 0 && <GroupsStep p={p} act={act} byId={byId} onOpenGallery={onOpenGallery} />}
    </>
  );
}

// ---------- 1. 畫風描述 ----------

function StyleStep({ p, act, chars }: { p: Project; act: ViewProps["act"]; chars: Character[] }) {
  const editable = ["draft", "preview_ready"].includes(p.status);
  const [f, setF] = useState({ request: p.request, name: p.name, framing: p.framing, style_block: p.style_block, square: p.process.square, margin: p.process.margin });
  // 伺服器端內容變了（例如擴寫完成）就同步到表單
  useEffect(() => {
    setF({ request: p.request, name: p.name, framing: p.framing, style_block: p.style_block, square: p.process.square, margin: p.process.margin });
  }, [p.request, p.name, p.framing, p.style_block, p.process.square, p.process.margin]);
  const dirty = f.name !== p.name || f.framing !== p.framing || f.style_block !== p.style_block || f.square !== p.process.square || f.margin !== p.process.margin;

  const [showPrompt, setShowPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");
  const body = () => ({ name: f.name, framing: f.framing, style_block: f.style_block, process: { square: f.square, margin: f.margin } });
  const save = () => act(() => api.patch<Project>(`/api/projects/${p.id}`, body()));
  const openPrompt = async () => {
    if (dirty) await save();
    setPromptText((await api.get<{ prompt: string }>(`/api/projects/${p.id}/prompt`)).prompt);
    setShowPrompt(true);
  };
  const setFraming = (framing: "closeup" | "whole") =>
    setF({ ...f, framing, square: framing === "closeup" ? 0.5 : null, margin: framing === "closeup" ? 0 : 0.04 });

  if (p.status === "expanding") {
    return <Section title="描述畫風" step={1}><div className="flex items-center gap-2 text-mute"><Spinner />Codex 正在把「{p.request}」擴寫成畫風描述，大約 30 秒～1 分鐘…</div></Section>;
  }
  return (
    <Section title="描述畫風" step={1} dim={!editable && p.status !== "previewing"}
      right={<button className="btn btn-sm" onClick={openPrompt} disabled={!p.style_block}>查看完整 prompt</button>}>
      <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
        <div><label className="label">你的需求</label>
          <div className="flex gap-2"><input className="input" value={f.request} disabled={!editable} onChange={(e) => setF({ ...f, request: e.target.value })} />
            <button className="btn shrink-0" disabled={!editable || (!f.request.trim() && !p.ref_paths.style.length)} title="用新的需求（和畫風參考圖）讓 Codex 重寫畫風描述"
              onClick={() => act(() => api.post<Project>(`/api/projects/${p.id}/expand`, { request: f.request }))}>重新擴寫</button></div></div>
        <div><label className="label">畫風名稱</label><input className="input" value={f.name} disabled={!editable} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">構圖</label>
          <select className="input" value={f.framing} disabled={!editable} onChange={(e) => setFraming(e.target.value as "closeup" | "whole")}>
            <option value="closeup">特寫（臉塞滿、邊緣裁切）</option><option value="whole">整顆入鏡（如麻糬）</option>
          </select></div>
      </div>
      <div className="mt-3"><label className="label">畫風描述（英文，會放進 prompt 的 Art style 段落；可以直接修改）</label>
        <textarea className="input h-44 resize-y font-mono text-xs leading-relaxed" value={f.style_block} disabled={!editable}
          onChange={(e) => setF({ ...f, style_block: e.target.value })} /></div>
      {p.notes_zh && <p className="mt-2 text-xs text-mute">💡 {p.notes_zh}</p>}
      <ProjectRefs p={p} act={act} chars={chars} editable={editable} />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-mute">
        <span>後處理：{f.square === null ? "不裁切" : `裁成正方形（上方比例 ${f.square}）`}、留白 {f.margin}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn" disabled={!editable || !dirty} onClick={save}>儲存修改</button>
          <button className="btn btn-primary" disabled={!editable || !f.style_block.trim()}
            onClick={async () => { if (dirty) await save(); await act(() => api.post<Project>(`/api/projects/${p.id}/preview`)); }}>
            {p.preview ? "用目前描述重新產生預覽" : "確認，產生風格預覽圖"}
          </button>
        </div>
      </div>
      <Modal open={showPrompt} onClose={() => setShowPrompt(false)}>
        <div className="mb-2 flex items-center"><h3 >預覽圖的完整 prompt</h3>
          <button className="btn btn-sm ml-auto" onClick={() => navigator.clipboard.writeText(promptText)}>複製</button></div>
        <pre className="whitespace-pre-wrap rounded-lg bg-panel2 p-3 text-xs leading-relaxed">{promptText}</pre>
      </Modal>
    </Section>
  );
}

// ---------- 2. 風格預覽 ----------

function PreviewStep({ p, act, previewIds, byId }: { p: Project; act: ViewProps["act"]; previewIds: number[]; byId: Map<number, Sticker> }) {
  const pv = p.preview;
  const [zoom, setZoom] = useState(false);
  if (!pv && p.status !== "previewing") {
    return <Section title="風格預覽" step={2} dim>
      <p className="text-sm text-mute">確認畫風描述後，會先用 {previewIds.map((i) => byId.get(i)?.label ?? `#${i}`).join("、")} 這 {previewIds.length} 個表情生成一張 2×2 預覽圖。確認風格後，這張圖會當作後續所有組別的畫風範本。</p>
    </Section>;
  }
  return (
    <Section title="風格預覽" step={2} right={pv?.log && <LogLink path={pv.log} style={p.id} />}>
      {pv?.status === "running" ? (
        <div className="flex items-center gap-2 text-mute"><Spinner />Codex 正在生成預覽圖 <Elapsed since={pv.started} />（通常 1～3 分鐘）</div>
      ) : pv?.status === "failed" ? (
        <p className="text-sm text-bad">預覽失敗：{pv.message}</p>
      ) : pv ? (
        <div className="flex flex-wrap items-start gap-4">
          <img src={fileUrl(pv.image, p.updated)} onClick={() => setZoom(true)} className="w-72 cursor-zoom-in rounded-lg" />
          <div className="max-w-md space-y-2 text-sm">
            <p className="text-mute">{pv.message}</p>
            {p.status === "preview_ready" && <>
              <p>喜歡這個風格嗎？</p>
              <ul className="list-disc space-y-1 pl-5 text-mute">
                <li>喜歡：在下方「選擇貼圖」勾選表情並開始生成。</li>
                <li>不喜歡：改上面的畫風描述，按「重新產生預覽」；或改需求後「重新擴寫」。</li>
              </ul>
            </>}
          </div>
          <Modal open={zoom} onClose={() => setZoom(false)}><img src={fileUrl(pv.image, p.updated)} className="w-full rounded-lg" /></Modal>
        </div>
      ) : null}
      {pv?.status === "failed" && <button className="btn mt-3" onClick={() => act(() => api.post<Project>(`/api/projects/${p.id}/preview`))}>重試</button>}
    </Section>
  );
}

// ---------- 3. 選擇貼圖 ----------

function PickStep({ p, act, stickers, setStickers, maxParallel }: {
  p: Project; act: ViewProps["act"]; stickers: Sticker[]; setStickers: ViewProps["setStickers"]; maxParallel: number;
}) {
  const locked = p.status !== "preview_ready";
  const [ids, setIds] = useState<number[]>(p.sticker_ids.length ? p.sticker_ids : stickers.filter((s) => s.group >= 1 && s.group <= 4).map((s) => s.id));
  useEffect(() => { if (p.sticker_ids.length) setIds(p.sticker_ids); }, [p.sticker_ids]);
  const groups = Math.ceil(ids.length / 8);
  return (
    <Section title="確認風格，選擇要生成的貼圖" step={3} dim={locked}>
      {locked && p.groups.length > 0 ? (
        <p className="text-sm text-mute">已送出 {p.sticker_ids.length} 張、{p.groups.length} 組。想換一批表情，可以再開一個新畫風，或沿用描述另建專案。</p>
      ) : (
        <>
          <StickerPicker stickers={stickers} value={ids} onChange={setIds} onAdded={(s) => setStickers((x) => [...x, s])} />
          <div className="mt-4 flex items-center justify-end gap-3 text-xs text-mute">
            <span>同時最多 {maxParallel} 組，預估 {Math.ceil(groups / maxParallel) * 3} 分鐘左右</span>
            <button className="btn btn-primary" disabled={!ids.length}
              onClick={() => act(() => api.post<Project>(`/api/projects/${p.id}/generate`, { ids }))}>
              開始生成 {ids.length} 張（{groups} 組）
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

// ---------- 4. 生成與審核 ----------

function GroupsStep({ p, act, byId, onOpenGallery }: { p: Project; act: ViewProps["act"]; byId: Map<number, Sticker>; onOpenGallery: () => void }) {
  const done = p.groups.filter((g) => g.status === "done").length;
  const failed = p.groups.filter((g) => g.status === "failed").length;
  return (
    <Section title="生成與審核" step={4}
      right={<span className="text-xs text-mute">完成 {done} / {p.groups.length}{failed ? `，失敗 ${failed}` : ""}</span>}>
      <div className="grid gap-3 md:grid-cols-2">
        {p.groups.map((g) => <GroupCard key={g.index} p={p} g={g} byId={byId} act={act} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4 text-sm">
        {p.status === "processing" && <span className="flex items-center gap-2 text-mute"><Spinner />切割、去背、輸出各尺寸中…</span>}
        {p.status === "review" && failed > 0 && <span className="text-xs text-warn">失敗的組不會被處理，可以先按「重生」</span>}
        {p.status === "done" ? (
          <>
            <span className="text-ok">已完成 {p.finished_ids?.length ?? 0} 張，已放入 Gallery</span>
            <button className="btn" onClick={() => act(() => api.post<Project>(`/api/projects/${p.id}/reopen`))}>重新開啟（再重生某組）</button>
            <button className="btn btn-primary" onClick={onOpenGallery}>前往 Gallery</button>
          </>
        ) : (
          <button className="btn btn-primary" disabled={p.status !== "review" || done === 0}
            onClick={() => act(() => api.post<Project>(`/api/projects/${p.id}/finalize`))}>
            確認，處理並放入 Gallery
          </button>
        )}
      </div>
    </Section>
  );
}

function GroupCard({ p, g, byId, act }: { p: Project; g: Group; byId: Map<number, Sticker>; act: ViewProps["act"] }) {
  const [zoom, setZoom] = useState(false);
  const canRegen = (p.status === "review" || p.status === "generating") && (g.status === "done" || g.status === "failed");
  return (
    <div className="rounded-2xl border border-line bg-panel2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span >第 {g.index} 組</span><span className="text-xs text-mute">{g.layout}，{g.ids.length} 張</span>
        <StatusBadge status={g.status} />{g.status === "running" && <Elapsed since={g.started} />}
        {g.attempts > 1 && <span className="text-xs text-mute">第 {g.attempts} 次</span>}
        <div className="ml-auto flex gap-1.5">
          {g.log && <LogLink path={g.log} style={p.id} />}
          <button className="btn btn-sm" disabled={!canRegen} onClick={() => act(() => api.post<Project>(`/api/projects/${p.id}/groups/${g.index}/regenerate`))}>重生</button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {g.ids.map((i) => <span key={i} className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-mute">#{i} {byId.get(i)?.label}</span>)}
      </div>
      {g.status === "done" ? (
        <>
          <img src={fileUrl(g.image, g.finished)} onClick={() => setZoom(true)} className="w-full cursor-zoom-in rounded-md" />
          <Modal open={zoom} onClose={() => setZoom(false)} wide><img src={fileUrl(g.image, g.finished)} className="w-full rounded-lg" /></Modal>
        </>
      ) : g.status === "failed" ? (
        <p className="text-sm text-bad">{g.message}</p>
      ) : (
        <div className="flex aspect-[3/2] items-center justify-center rounded-md bg-panel text-sm text-mute">
          {g.status === "running" ? <span className="flex items-center gap-2"><Spinner />生成中</span> : "排隊中"}
        </div>
      )}
    </div>
  );
}

function LogLink({ path, style }: { path: string; style: string }) {
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

// 已建立專案的參考圖：每個動作直接存到伺服器
function ProjectRefs({ p, act, chars, editable }: { p: Project; act: ViewProps["act"]; chars: Character[]; editable: boolean }) {
  const base = `/api/projects/${p.id}`;
  const temp: TempRef[] = p.refs.temp.map((t) => ({ key: t.file, name: t.file, role: t.role, url: fileUrl(`outputs/${p.id}/refs/${t.file}`) }));
  const [open, setOpen] = useState(false);
  const n = p.ref_paths.character.length + p.ref_paths.style.length;
  const charName = chars.find((c) => c.id === p.refs.character_id)?.name;
  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel2/60 p-3">
      <button className="flex w-full items-center gap-2 text-left text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>參考圖</span>
        <span className="text-xs text-mute">{charName ? `角色：${charName}` : "未指定角色"}・附 {n} 張{p.ref_paths.style.length ? `（含畫風參考 ${p.ref_paths.style.length} 張）` : ""}</span>
        <span className="ml-auto text-xs text-acc">{open ? "收起" : editable ? "調整" : "查看"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <RefPicker characters={chars} characterId={p.refs.character_id} characterImages={p.refs.character_images} disabled={!editable}
            onCharacter={(id, images) => act(() => api.patch<Project>(base, { character_id: id, character_images: id === p.refs.character_id ? images : null }))}
            temp={temp}
            onAddTemp={async (files) => { const ups = await readFiles(files, "character"); if (ups.length) await act(() => api.post<Project>(`${base}/refs`, ups)); }}
            onTempRole={(file, role) => act(() => api.patch<Project>(`${base}/refs/${encodeURIComponent(file)}`, { role }))}
            onRemoveTemp={(file) => act(() => api.patch<Project>(`${base}/refs/${encodeURIComponent(file)}`, { remove: true }))} />
          {editable && p.preview && <p className="mt-2 text-xs text-mute">改了參考圖之後，記得按「重新產生預覽」才會套用到樣張。</p>}
          {!editable && <p className="mt-2 text-xs text-mute">生成中或已完成時不能改參考圖。</p>}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api, BUSY, type Character, type LibStyle, type Project, type ProjectSummary } from "../api";
import { Spinner, StatusBadge } from "../components/ui";
import { useStickers } from "../stickers";
import { copyText, DeleteConfirm, MenuIcons, SideDeleteIcon, TrashButton, useContextMenu, type DeleteTarget, type MenuItem } from "../components/manage";
import { NewProject } from "./gen/NewProject";
import { ProjectView } from "./gen/ProjectView";

type ProjectsResp = { projects: ProjectSummary[]; next_id: string; preview_ids: number[]; max_parallel: number; default_layout?: "3x2" | "4x2w" };

export default function GenPage({ onOpenGallery, active }: { onOpenGallery: () => void; active: boolean }) {
  const [list, setList] = useState<ProjectsResp | null>(null);
  const [current, setCurrent] = useState<string | null>(null);   // null = 新增貼圖
  const [project, setProject] = useState<Project | null>(null);
  const { all: stickers } = useStickers();   // 含已刪除的（舊專案的組別還要顯示名稱）
  const [err, setErr] = useState("");
  const [newKey, setNewKey] = useState(0);   // 每按一次「新增貼圖」+1，讓表單聚焦並閃一下
  const [chars, setChars] = useState<Character[]>([]);
  // 切回這頁就重抓角色（可能剛在「角色」分頁新增或改過）
  const [libs, setLibs] = useState<LibStyle[]>([]);
  // 切回這頁就重抓角色和畫風庫（可能剛在其他分頁新增或改過）
  useEffect(() => {
    if (!active) return;
    api.get<Character[]>("/api/characters").then(setChars).catch(() => {});
    api.get<LibStyle[]>("/api/style-lib").then(setLibs).catch(() => {});
  }, [active]);

  const [trashKey, setTrashKey] = useState(0);   // 刪除後 +1，讓右下角垃圾桶重抓數量
  const loadList = useCallback(async () => setList(await api.get<ProjectsResp>("/api/projects")), []);
  const loadProject = useCallback(async (id: string) => setProject(await api.get<Project>(`/api/projects/${id}`)), []);

  // 切回這頁就重抓專案清單（可能剛在別的分頁從垃圾桶還原）
  useEffect(() => { if (active) loadList(); }, [active, loadList]);
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

  // 刪除專案：側欄垃圾桶圖示、右鍵選單、頁面內容的刪除鈕都走這裡（先跳確認框）
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const askDelete = (p: Pick<ProjectSummary, "id" | "name" | "status">) => setToDelete({
    id: p.id, title: p.name,
    warn: p.status === "done" ? "這個專案已完成，它的貼圖也會一起從圖庫消失（還原後會回來）。" : undefined,
  });
  const doDelete = async (id: string) => {
    await api.del(`/api/projects/${id}`);
    if (current === id) setCurrent(null);
    setTrashKey((k) => k + 1);
    loadList();
  };
  const [menu, openMenu] = useContextMenu();
  const menuFor = (p: ProjectSummary): MenuItem[] => [
    { label: "開啟", icon: MenuIcons.open, onSelect: () => setCurrent(p.id) },
    ...(p.status === "done" ? [{ label: "在圖庫查看", icon: MenuIcons.gallery, onSelect: onOpenGallery }] : []),
    { label: `複製編號 ${p.id}`, icon: MenuIcons.copy, onSelect: () => copyText(p.id) },
    "sep",
    { label: "刪除", icon: MenuIcons.trash, danger: true, disabled: BUSY.includes(p.status), hint: BUSY.includes(p.status) ? "執行中不能刪除" : undefined, onSelect: () => askDelete(p) },
  ];

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col">
        <div className="shrink-0 px-4 pt-4">
          <button className={`btn mb-3 w-full ${current === null ? "btn-primary" : ""}`} onClick={() => { setCurrent(null); setNewKey((k) => k + 1); }}>＋ 新增貼圖</button>
          <div className="mb-1 px-1 text-xs text-mute">貼圖專案</div>
        </div>
        <div className="side-list">
        {list?.projects.length === 0 && <div className="px-1 text-xs text-mute">還沒有專案，在右邊描述第一個畫風就會出現在這裡</div>}
        {list?.projects.map((p) => (
          <div key={p.id} className="group relative mb-1.5" onContextMenu={(e) => openMenu(e, menuFor(p))}>
            <button onClick={() => setCurrent(p.id)}
              className={`block w-full rounded-2xl border px-3 py-2.5 pr-9 text-left transition ${current === p.id ? "border-acc bg-panel shadow-[var(--shadow-soft)]" : "border-transparent hover:bg-panel/70"}`}>
              <div className="flex items-center gap-2"><span >{p.id}</span><span className="truncate text-xs text-mute">{p.name}</span></div>
              {p.character_id && <div className="mt-0.5 truncate text-[11px] text-mute">角色：{chars.find((c) => c.id === p.character_id)?.name ?? p.character_id}</div>}
              <div className="mt-1"><StatusBadge status={p.status} /></div>
            </button>
            <SideDeleteIcon onClick={() => askDelete(p)} disabled={BUSY.includes(p.status)} label={`刪除專案 ${p.id}`} shown={current === p.id} />
          </div>
        ))}
        </div>
        {menu}
        <DeleteConfirm target={toDelete} noun="專案" onConfirm={doDelete} onClose={() => setToDelete(null)} />
        <TrashButton kind="projects" active={active} refreshKey={trashKey}
          onRestored={(id) => { loadList(); setCurrent(id); }} />
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-5" data-tour="gen-main">
        <div className="mx-auto max-w-6xl space-y-4">
          {err && <div className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</div>}
          {current === null
            ? <div data-tour="gen-new"><NewProject focusKey={newKey} nextId={list?.next_id} chars={chars} libs={libs} onCreate={(body) => act(() => api.post<Project>("/api/projects", body))} /></div>
            : project
              ? <ProjectView p={project} stickers={stickers} act={act} chars={chars}
                  previewIds={list?.preview_ids ?? []} maxParallel={list?.max_parallel ?? 3} defaultLayout={list?.default_layout ?? "4x2w"} onOpenGallery={onOpenGallery}
                  onDelete={() => askDelete(project)} />
              : <div className="flex items-center gap-2 text-mute"><Spinner />載入中…</div>}
        </div>
      </div>
    </div>
  );
}

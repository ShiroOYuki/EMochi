import { useEffect, useState } from "react";
import {
  BUSY,
  invalidate,
  keys,
  projectsApi,
  queryClient,
  useCharacters,
  useProject,
  useProjects,
  useStyleLib,
  type Project,
  type ProjectSummary,
} from "../api";
import { Spinner, StatusBadge } from "../components/ui";
import { useStickers } from "../stickers";
import { MenuIcons, useContextMenu, type MenuItem } from "../components/ContextMenu";
import { SideDeleteIcon } from "../components/DeleteButton";
import { TrashButton } from "../components/Trash";
import { DeleteConfirm, type DeleteTarget } from "../components/confirm";
import { copyText } from "../lib/clipboard";
import { onOpenProject } from "../notify";
import { NewProject } from "./gen/NewProject";
import { ProjectView } from "./gen/ProjectView";

export default function GenPage({ onOpenGallery }: { onOpenGallery: () => void }) {
  const [current, setCurrent] = useState<string | null>(null); // null = 新增貼圖
  const { data: project = null } = useProject(current); // 執行中會自動輪詢
  const busy = !!project && BUSY.includes(project.status);
  const { data: list } = useProjects(busy);
  const { data: chars = [] } = useCharacters();
  const { data: libs = [] } = useStyleLib();
  const { all: stickers } = useStickers(); // 含已刪除的（舊專案的組別還要顯示名稱）
  const [err, setErr] = useState("");
  const [newKey, setNewKey] = useState(0); // 每按一次「新增貼圖」+1，讓表單聚焦並閃一下

  useEffect(() => setErr(""), [current]);
  // 點桌面通知：打開那個專案（已經開著就重抓一次，馬上看到最新狀態）
  useEffect(
    () =>
      onOpenProject((id) => {
        setCurrent(id);
        invalidate(keys.project(id), keys.projects);
      }),
    [],
  );
  // 收尾完成（變成 done）→ 圖庫、畫風庫的「可匯入」清單多了東西
  const status = project?.status;
  useEffect(() => {
    if (status === "done") invalidate(keys.gallery, keys.importable);
  }, [status]);

  /** 呼叫會改變專案狀態的 API：成功後把回傳的專案放進快取（畫面立刻更新），清單重抓 */
  const act = async (fn: () => Promise<Project>) => {
    setErr("");
    try {
      const p = await fn();
      queryClient.setQueryData(keys.project(p.id), p);
      setCurrent(p.id);
      invalidate(keys.projects);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  // 刪除專案：側欄垃圾桶圖示、右鍵選單、頁面內容的刪除鈕都走這裡（先跳確認框）
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const askDelete = (p: Pick<ProjectSummary, "id" | "name" | "status">) =>
    setToDelete({
      id: p.id,
      title: p.name,
      warn: p.status === "done" ? "這個專案已完成，它的貼圖也會一起從圖庫消失（還原後會回來）。" : undefined,
    });
  const doDelete = async (id: string) => {
    await projectsApi.remove(id);
    if (current === id) setCurrent(null);
    invalidate(keys.projects, keys.trashAll, keys.gallery);
  };
  const [menu, openMenu] = useContextMenu();
  const menuFor = (p: ProjectSummary): MenuItem[] => [
    { label: "開啟", icon: MenuIcons.open, onSelect: () => setCurrent(p.id) },
    ...(p.status === "done"
      ? [{ label: "在圖庫查看", icon: MenuIcons.gallery, onSelect: onOpenGallery }]
      : []),
    { label: `複製編號 ${p.id}`, icon: MenuIcons.copy, onSelect: () => copyText(p.id) },
    "sep",
    {
      label: "刪除",
      icon: MenuIcons.trash,
      danger: true,
      disabled: BUSY.includes(p.status),
      hint: BUSY.includes(p.status) ? "執行中不能刪除" : undefined,
      onSelect: () => askDelete(p),
    },
  ];

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col">
        <div className="shrink-0 px-4 pt-4">
          <button
            className={`btn mb-3 w-full ${current === null ? "btn-primary" : ""}`}
            onClick={() => {
              setCurrent(null);
              setNewKey((k) => k + 1);
            }}
          >
            ＋ 新增貼圖
          </button>
          <div className="mb-1 px-1 text-xs text-mute">貼圖專案</div>
        </div>
        <div className="side-list">
          {list?.projects.length === 0 && (
            <div className="px-1 text-xs text-mute">還沒有專案，在右邊描述第一個畫風就會出現在這裡</div>
          )}
          {list?.projects.map((p) => (
            <div key={p.id} className="group relative mb-1.5" onContextMenu={(e) => openMenu(e, menuFor(p))}>
              <button
                onClick={() => setCurrent(p.id)}
                className={`block w-full rounded-2xl border px-3 py-2.5 pr-9 text-left transition ${current === p.id ? "border-acc bg-panel shadow-[var(--shadow-soft)]" : "border-transparent hover:bg-panel/70"}`}
              >
                <div className="flex items-center gap-2">
                  <span>{p.id}</span>
                  <span className="truncate text-xs text-mute">{p.name}</span>
                </div>
                {p.character_id && (
                  <div className="mt-0.5 truncate text-[11px] text-mute">
                    角色：{chars.find((c) => c.id === p.character_id)?.name ?? p.character_id}
                  </div>
                )}
                <div className="mt-1">
                  <StatusBadge status={p.status} />
                </div>
              </button>
              <SideDeleteIcon
                onClick={() => askDelete(p)}
                disabled={BUSY.includes(p.status)}
                label={`刪除專案 ${p.id}`}
                shown={current === p.id}
              />
            </div>
          ))}
        </div>
        {menu}
        <DeleteConfirm target={toDelete} noun="專案" onConfirm={doDelete} onClose={() => setToDelete(null)} />
        <TrashButton
          kind="projects"
          onRestored={(id) => {
            invalidate(keys.projects, keys.gallery);
            setCurrent(id);
          }}
        />
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-5" data-tour="gen-main">
        <div className="mx-auto max-w-6xl space-y-4">
          {err && (
            <div className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</div>
          )}
          {current === null ? (
            <div data-tour="gen-new">
              <NewProject
                focusKey={newKey}
                nextId={list?.next_id}
                chars={chars}
                libs={libs}
                onCreate={(body) => act(() => projectsApi.create(body))}
              />
            </div>
          ) : project ? (
            <ProjectView
              p={project}
              stickers={stickers}
              act={act}
              chars={chars}
              previewIds={list?.preview_ids ?? []}
              maxParallel={list?.max_parallel ?? 3}
              defaultLayout={list?.default_layout ?? "4x2w"}
              onOpenGallery={onOpenGallery}
              onDelete={() => askDelete(project)}
            />
          ) : (
            <div className="flex items-center gap-2 text-mute">
              <Spinner />
              載入中…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

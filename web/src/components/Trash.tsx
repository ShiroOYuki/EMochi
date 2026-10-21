/** 側欄左下角的「垃圾桶」：專案／畫風／角色共用一個清單（還原／永久刪除／清空） */
import { useEffect, useState } from "react";
import { fileUrl, invalidate, keys, trashApi, useTrash, type TrashItem, type TrashKind } from "../api";
import { SPRING, Modal, StatusBadge } from "./ui";
import { useReducedMotion } from "motion/react";
import {
  Tabs,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/primitives/radix/tabs";
import { TrashIcon } from "./icons";
import { navigate, type Tab } from "../router";
import { DANGER } from "./confirm";

const fmtSize = (b: number) =>
  b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const KINDS: { kind: TrashKind; noun: string; tab: Tab }[] = [
  { kind: "projects", noun: "專案", tab: "gen" },
  { kind: "styles", noun: "畫風", tab: "styles" },
  { kind: "characters", noun: "角色", tab: "characters" },
];

/** 側欄左下角的「垃圾桶」：專案、畫風、角色放在同一個垃圾桶（分頁籤），預設打開目前這一頁的種類。
 *  放在 aside（flex flex-col，清單包在 .side-list 裡自己捲動）的最後面，固定在左下角，清單不會從它底下穿過去。刪除、還原後呼叫 invalidate(keys.trashAll) 就會重抓數量。
 *  onRestored：還原的是這一頁的種類就交給頁面選取；其他種類會切到那個分頁 */
export function TrashButton({ kind, onRestored }: { kind: TrashKind; onRestored: (id: string) => void }) {
  const projects = useTrash("projects");
  const styles = useTrash("styles");
  const characters = useTrash("characters");
  const items: Record<TrashKind, TrashItem[]> = {
    projects: projects.data ?? [],
    styles: styles.data ?? [],
    characters: characters.data ?? [],
  };
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TrashKind>(kind);
  const load = () => invalidate(keys.trashAll);
  const total = items.projects.length + items.styles.length + items.characters.length;
  return (
    <div className="shrink-0 border-t border-line/60 px-4 pt-2 pb-4">
      <button
        onClick={() => {
          setTab(kind);
          setOpen(true);
          load();
        }}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-mute transition hover:bg-bad/10 hover:text-bad"
      >
        <TrashIcon />
        垃圾桶
        {total > 0 && (
          <span className="ml-auto rounded-full bg-panel2 px-2 text-xs tabular-nums">{total}</span>
        )}
      </button>
      <TrashModal
        open={open}
        onClose={() => setOpen(false)}
        tab={tab}
        setTab={setTab}
        items={items}
        onChanged={async (restored) => {
          await load();
          if (!restored) return;
          if (restored.kind === kind) onRestored(restored.id);
          else navigate({ tab: KINDS.find((k) => k.kind === restored.kind)!.tab, id: restored.id }); // 切過去並選取還原的那筆
        }}
      />
    </div>
  );
}

/** 永久刪除要按兩次（第一次變成「確定？」，3 秒沒按就取消），避免手滑 */
function TrashModal({
  open,
  onClose,
  tab,
  setTab,
  items,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  tab: TrashKind;
  setTab: (k: TrashKind) => void;
  items: Record<TrashKind, TrashItem[]>;
  onChanged: (restored?: { kind: TrashKind; id: string }) => Promise<void>;
}) {
  const [arm, setArm] = useState<string | null>(null); // 等待第二次確認的項目；"*" = 清空這一類
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) {
      setArm(null);
      setErr("");
    }
  }, [open]);
  useEffect(() => {
    setArm(null);
    setErr("");
  }, [tab]);
  useEffect(() => {
    if (!arm) return;
    const t = setTimeout(() => setArm(null), 3000);
    return () => clearTimeout(t);
  }, [arm]);
  const run = async (key: string, fn: () => Promise<unknown>, restored?: string) => {
    setBusy(key);
    setErr("");
    try {
      await fn();
      setArm(null);
      await onChanged(restored ? { kind: tab, id: restored } : undefined);
      if (restored) onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const list = items[tab];
  const noun = KINDS.find((k) => k.kind === tab)!.noun;
  const size = list.reduce((n, t) => n + t.size, 0);
  return (
    <Modal open={open} onClose={() => !busy && onClose()} label="垃圾桶">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-lg">垃圾桶</h3>
        {/* Animate UI Tabs：選中的藍色底會用彈簧滑到新分頁；方向鍵可切換 */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TrashKind)}>
          <TabsHighlight
            className="absolute inset-0 z-0 rounded-full bg-acc"
            transition={reduce ? { duration: 0 } : SPRING}
          >
            <TabsList className="flex rounded-full bg-panel2 p-1" aria-label="垃圾桶種類">
              {KINDS.map((k) => (
                <TabsHighlightItem key={k.kind} value={k.kind}>
                  <TabsTrigger
                    value={k.kind}
                    className="relative z-[1] rounded-full px-3.5 py-1 text-sm text-mute outline-none transition-colors hover:text-text focus-visible:ring-3 focus-visible:ring-acc/40 data-[state=active]:text-on-acc data-[state=active]:hover:text-on-acc"
                  >
                    {k.noun}
                    {items[k.kind].length > 0 && (
                      <span className="ml-1 tabular-nums opacity-80">{items[k.kind].length}</span>
                    )}
                  </TabsTrigger>
                </TabsHighlightItem>
              ))}
            </TabsList>
          </TabsHighlight>
        </Tabs>
        {list.length > 0 && (
          <button
            className={`btn btn-sm ml-auto ${arm === "*" ? DANGER : "hover:border-bad hover:text-bad"}`}
            disabled={!!busy}
            onClick={() => (arm === "*" ? run("*", () => trashApi.empty(tab)) : setArm("*"))}
          >
            {busy === "*" ? "清空中…" : arm === "*" ? `確定永久刪除全部${noun}？` : `清空${noun}`}
          </button>
        )}
      </div>
      {err && <p className="mb-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-mute">沒有刪除的{noun}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-mute">
            {list.length} 個{noun}・{fmtSize(size)}
          </p>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {list.map((t) => (
              <li key={t.name} className="flex items-center gap-3 rounded-2xl bg-panel2 px-3 py-2.5">
                {t.thumb ? (
                  <img
                    src={fileUrl(t.thumb)}
                    className="checker size-11 shrink-0 rounded-xl object-cover"
                    alt=""
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-panel text-mute">
                    ?
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span>{t.id}</span>
                    <span className="truncate text-xs text-mute">{t.title}</span>
                    {t.status && <StatusBadge status={t.status} />}
                  </div>
                  <div className="mt-0.5 text-[11px] text-mute">
                    刪除於 {t.removed || "—"}・{fmtSize(t.size)}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  disabled={!!busy || !t.restorable}
                  title={t.restorable ? "放回清單" : `已經有 ${t.id}，不能還原`}
                  onClick={() => run(t.name, () => trashApi.restore(tab, t.name), t.id)}
                >
                  還原
                </button>
                <button
                  className={`btn btn-sm ${arm === t.name ? DANGER : "hover:border-bad hover:text-bad"}`}
                  disabled={!!busy}
                  onClick={() =>
                    arm === t.name ? run(t.name, () => trashApi.purge(tab, t.name)) : setArm(t.name)
                  }
                >
                  {busy === t.name && arm === t.name ? "刪除中…" : arm === t.name ? "確定？" : "永久刪除"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-[11px] text-mute">
        永久刪除後無法復原；這個編號之後也不會再被新建的{noun}使用。
      </p>
    </Modal>
  );
}

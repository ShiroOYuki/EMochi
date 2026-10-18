/** 刪除與垃圾桶的共用元件：Gen 專案、畫風庫、角色庫三個分頁都用這一套
 *  - DeleteConfirm：刪除前的確認框（移到垃圾桶，可還原）
 *  - DeleteButton：頁面內容裡的刪除按鈕
 *  - SideDeleteIcon：側欄項目右上角的垃圾桶小圖示（滑過才出現）
 *  - useContextMenu：側欄右鍵選單
 *  - TrashButton：側欄左下角的「垃圾桶」，專案／畫風／角色共用一個清單（還原／永久刪除／清空）
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import { api, fileUrl, type TrashItem, type TrashKind } from "../api";
import { Modal, Spinner, StatusBadge } from "./ui";

export function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

const DANGER = "border-bad bg-bad text-white hover:border-bad hover:text-white hover:brightness-105";

// ---------- 刪除確認 ----------

export type DeleteTarget = { id: string; title?: string; warn?: ReactNode };

/** target 不是 null 就打開；onConfirm 丟錯時把訊息顯示在框裡 */
export function DeleteConfirm({ target, noun, onConfirm, onClose }: {
  target: DeleteTarget | null; noun: string; onConfirm: (id: string) => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setErr(""); }, [target]);
  const go = async () => {
    if (!target) return;
    setBusy(true); setErr("");
    try { await onConfirm(target.id); onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={!!target} onClose={() => !busy && onClose()}>
      {target && <div className="space-y-3">
        <h3 className="text-lg">刪除{noun} {target.id}{target.title ? `「${target.title}」` : ""}？</h3>
        <p className="text-sm text-mute">會移到左下角的「垃圾桶」，之後還能還原，或在那裡永久刪除。</p>
        {target.warn && <div className="rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">{target.warn}</div>}
        {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onClose} disabled={busy}>取消</button>
          <button className={`btn ${DANGER}`} onClick={go} disabled={busy} autoFocus>
            {busy ? <><Spinner className="size-3.5 border-white border-t-transparent" />刪除中</> : "刪除"}
          </button>
        </div>
      </div>}
    </Modal>
  );
}

/** 頁面內容裡的刪除按鈕（外框款，滑過變紅） */
export function DeleteButton({ onClick, disabled, title, label = "刪除" }: { onClick: () => void; disabled?: boolean; title?: string; label?: string }) {
  return (
    <button className="btn text-mute hover:border-bad hover:text-bad" onClick={onClick} disabled={disabled} title={title}>
      <TrashIcon size={14} />{label}
    </button>
  );
}

/** 側欄項目右上角的垃圾桶；外層要有 `group relative` */
export function SideDeleteIcon({ onClick, disabled, label, shown }: { onClick: () => void; disabled?: boolean; label: string; shown?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={disabled ? "執行中不能刪除" : label} aria-label={label}
      className={`absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-panel/80 text-mute transition hover:bg-bad/15 hover:text-bad focus-visible:opacity-100 disabled:hover:bg-transparent disabled:hover:text-mute ${shown ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
      <TrashIcon />
    </button>
  );
}

// ---------- 右鍵選單 ----------

export type MenuItem = { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; hint?: string; onSelect: () => void } | "sep";

/** 用法：const [menu, openMenu] = useContextMenu(); <div onContextMenu={(e) => openMenu(e, items)} />，並把 {menu} 放進畫面 */
export function useContextMenu(): [ReactNode, (e: RMouseEvent, items: MenuItem[]) => void] {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const open = useCallback((e: RMouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);
  const menu = state && <ContextMenu {...state} onClose={() => setState(null)} />;
  return [menu, open];
}

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  // 貼著游標開；超出視窗就往左／往上翻
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - width - 8), top: Math.min(y, window.innerHeight - height - 8) });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const close = () => onClose();
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] min-w-44 rounded-2xl border border-line bg-panel p-1.5 text-sm shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)]">
      {items.map((it, i) => it === "sep"
        ? <div key={i} className="my-1 h-px bg-line" />
        : (
          <button key={i} role="menuitem" disabled={it.disabled} title={it.hint}
            onClick={() => { onClose(); it.onSelect(); }}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left outline-none transition disabled:opacity-40 ${it.danger ? "text-bad hover:bg-bad/12 focus-visible:bg-bad/12" : "hover:bg-panel2 focus-visible:bg-panel2"}`}>
            <span className="flex w-4 justify-center text-mute">{it.icon}</span>{it.label}
          </button>
        ))}
    </div>
  );
}

export const MenuIcons = {
  open: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
  copy: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>,
  gallery: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 8" /></svg>,
  trash: <TrashIcon size={14} />,
};

export const copyText = (t: string) => { navigator.clipboard?.writeText(t).catch(() => {}); };

// ---------- 總垃圾桶（側欄左下角） ----------

const fmtSize = (b: number) => b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const KINDS: { kind: TrashKind; noun: string; tab: string }[] = [
  { kind: "projects", noun: "專案", tab: "#/gen" },
  { kind: "styles", noun: "畫風", tab: "#/styles" },
  { kind: "characters", noun: "角色", tab: "#/characters" },
];

/** 側欄左下角的「垃圾桶」：專案、畫風、角色放在同一個垃圾桶（分頁籤），預設打開目前這一頁的種類。
 *  放在 aside（要是 flex flex-col）的最後面，會貼齊左下角；清單很長時 sticky 留在底部。refreshKey 改變或分頁切回來時重抓數量。
 *  onRestored：還原的是這一頁的種類就交給頁面選取；其他種類會切到那個分頁 */
export function TrashButton({ kind, active, refreshKey, onRestored }: {
  kind: TrashKind; active: boolean; refreshKey: number; onRestored: (id: string) => void;
}) {
  const [items, setItems] = useState<Record<TrashKind, TrashItem[]>>({ projects: [], styles: [], characters: [] });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TrashKind>(kind);
  const load = useCallback(async () => {
    const lists = await Promise.all(KINDS.map((k) => api.get<TrashItem[]>(`/api/trash/${k.kind}`).catch(() => [] as TrashItem[])));
    setItems({ projects: lists[0], styles: lists[1], characters: lists[2] });
  }, []);
  useEffect(() => { if (active) load(); }, [active, refreshKey, load]);
  const total = items.projects.length + items.styles.length + items.characters.length;
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto bg-bg px-4 pt-2 pb-4">
      <button onClick={() => { setTab(kind); setOpen(true); load(); }}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-mute transition hover:bg-bad/10 hover:text-bad">
        <TrashIcon />垃圾桶{total > 0 && <span className="ml-auto rounded-full bg-panel2 px-2 text-xs tabular-nums">{total}</span>}
      </button>
      <TrashModal open={open} onClose={() => setOpen(false)} tab={tab} setTab={setTab} items={items}
        onChanged={async (restored) => {
          await load();
          if (!restored) return;
          if (restored.kind === kind) onRestored(restored.id);
          else location.hash = KINDS.find((k) => k.kind === restored.kind)!.tab;
        }} />
    </div>
  );
}

/** 永久刪除要按兩次（第一次變成「確定？」，3 秒沒按就取消），避免手滑 */
function TrashModal({ open, onClose, tab, setTab, items, onChanged }: {
  open: boolean; onClose: () => void; tab: TrashKind; setTab: (k: TrashKind) => void; items: Record<TrashKind, TrashItem[]>;
  onChanged: (restored?: { kind: TrashKind; id: string }) => Promise<void>;
}) {
  const [arm, setArm] = useState<string | null>(null);     // 等待第二次確認的項目；"*" = 清空這一類
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (!open) { setArm(null); setErr(""); } }, [open]);
  useEffect(() => { setArm(null); setErr(""); }, [tab]);
  useEffect(() => {
    if (!arm) return;
    const t = setTimeout(() => setArm(null), 3000);
    return () => clearTimeout(t);
  }, [arm]);
  const run = async (key: string, fn: () => Promise<unknown>, restored?: string) => {
    setBusy(key); setErr("");
    try { await fn(); setArm(null); await onChanged(restored ? { kind: tab, id: restored } : undefined); if (restored) onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };
  const list = items[tab];
  const noun = KINDS.find((k) => k.kind === tab)!.noun;
  const size = list.reduce((n, t) => n + t.size, 0);
  const base = `/api/trash/${tab}`;
  return (
    <Modal open={open} onClose={() => !busy && onClose()}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-lg">垃圾桶</h3>
        <div className="flex rounded-full bg-panel2 p-1" role="tablist">
          {KINDS.map((k) => (
            <button key={k.kind} role="tab" aria-selected={tab === k.kind} onClick={() => setTab(k.kind)}
              className={`rounded-full px-3.5 py-1 text-sm transition ${tab === k.kind ? "bg-acc text-on-acc" : "text-mute hover:text-text"}`}>
              {k.noun}{items[k.kind].length > 0 && <span className="ml-1 tabular-nums opacity-80">{items[k.kind].length}</span>}
            </button>
          ))}
        </div>
        {list.length > 0 && (
          <button className={`btn btn-sm ml-auto ${arm === "*" ? DANGER : "hover:border-bad hover:text-bad"}`}
            disabled={!!busy} onClick={() => arm === "*" ? run("*", () => api.del(base)) : setArm("*")}>
            {busy === "*" ? "清空中…" : arm === "*" ? `確定永久刪除全部${noun}？` : `清空${noun}`}
          </button>
        )}
      </div>
      {err && <p className="mb-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-mute">沒有刪除的{noun}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-mute">{list.length} 個{noun}・{fmtSize(size)}</p>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {list.map((t) => (
              <li key={t.name} className="flex items-center gap-3 rounded-2xl bg-panel2 px-3 py-2.5">
                {t.thumb
                  ? <img src={fileUrl(t.thumb)} className="checker size-11 shrink-0 rounded-xl object-cover" alt="" />
                  : <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-panel text-mute">?</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span>{t.id}</span><span className="truncate text-xs text-mute">{t.title}</span>{t.status && <StatusBadge status={t.status} />}</div>
                  <div className="mt-0.5 text-[11px] text-mute">刪除於 {t.removed || "—"}・{fmtSize(t.size)}</div>
                </div>
                <button className="btn btn-sm" disabled={!!busy || !t.restorable} title={t.restorable ? "放回清單" : `已經有 ${t.id}，不能還原`}
                  onClick={() => run(t.name, () => api.post(`${base}/${encodeURIComponent(t.name)}/restore`), t.id)}>還原</button>
                <button className={`btn btn-sm ${arm === t.name ? DANGER : "hover:border-bad hover:text-bad"}`}
                  disabled={!!busy} onClick={() => arm === t.name ? run(t.name, () => api.del(`${base}/${encodeURIComponent(t.name)}`)) : setArm(t.name)}>
                  {busy === t.name && arm === t.name ? "刪除中…" : arm === t.name ? "確定？" : "永久刪除"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-[11px] text-mute">永久刪除後無法復原；這個編號之後也不會再被新建的{noun}使用。</p>
    </Modal>
  );
}

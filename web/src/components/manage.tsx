/** 刪除與垃圾桶的共用元件：Gen 專案、畫風庫、角色庫三個分頁都用這一套
 *  - DeleteConfirm：刪除前的確認框（移到垃圾桶，可還原）
 *  - DeleteButton：頁面內容裡的刪除按鈕
 *  - SideDeleteIcon：側欄項目右上角的垃圾桶小圖示（滑過才出現）
 *  - useContextMenu：側欄右鍵選單
 *  - TrashButton：側欄左下角的「垃圾桶」，專案／畫風／角色共用一個清單（還原／永久刪除／清空）
 *  - useConfirm：一般的確認框（取代瀏覽器原生 confirm()，樣式和 App 一致）
 */
import { useCallback, useEffect, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuHighlight, DropdownMenuHighlightItem, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/animate-ui/primitives/radix/dropdown-menu";
import { api, fileUrl, type TrashItem, type TrashKind } from "../api";
import { SPRING, Modal, Spinner, StatusBadge } from "./ui";
import { useReducedMotion } from "motion/react";
import { Tabs, TabsHighlight, TabsHighlightItem, TabsList, TabsTrigger } from "@/components/animate-ui/primitives/radix/tabs";

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
    <Modal open={!!target} onClose={() => !busy && onClose()} label={`刪除${noun}`}>
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

export type ConfirmOptions = { title: string; body?: ReactNode; ok?: string; cancel?: string; danger?: boolean };

/** App 樣式的確認框：const [confirmDialog, ask] = useConfirm()；if (!(await ask({ title: "…" }))) return;
 *  把 confirmDialog 放進畫面裡。取消、按 Esc、點外面都算「否」 */
export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })), []);
  const done = (v: boolean) => { req?.resolve(v); setReq(null); };
  const node = (
    <Modal open={!!req} onClose={() => done(false)} label={req?.title ?? "確認"}>
      {req && <div className="space-y-3">
        <h3 className="text-lg">{req.title}</h3>
        {req.body && <div className="text-sm leading-relaxed text-mute">{req.body}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={() => done(false)}>{req.cancel ?? "取消"}</button>
          <button className={`btn ${req.danger ? DANGER : "btn-primary"}`} onClick={() => done(true)} autoFocus>{req.ok ?? "確定"}</button>
        </div>
      </div>}
    </Modal>
  );
  return [node, ask];
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
  const [open, setOpen] = useState(false);
  const show = useCallback((e: RMouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, items });
    setOpen(true);
  }, []);
  // state 在關閉後保留，收起動畫期間選單內容才不會先消失
  const menu = state && <ContextMenu {...state} open={open} onOpenChange={setOpen} />;
  return [menu, show];
}

/** 用 Animate UI 的 Radix DropdownMenu 做右鍵選單：在游標位置放一個看不見的觸發點。
 *  得到：淡入縮放、滑過時底色用彈簧滑到該項、方向鍵／Home／End／字首跳選、Esc 關閉、碰到視窗邊緣自動翻轉 */
function ContextMenu({ x, y, items, open, onOpenChange }: {
  x: number; y: number; items: MenuItem[]; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={2} collisionPadding={8}
        transition={reduce ? { duration: 0 } : { duration: 0.12, ease: "easeOut" }}
        onContextMenu={(e) => e.preventDefault()}
        className="z-[60] min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl border border-line bg-panel p-1.5 text-sm shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] outline-none">
        <DropdownMenuHighlight className="absolute inset-0 z-0 rounded-xl bg-panel2" transition={reduce ? { duration: 0 } : SPRING}>
          {items.map((it, i) => it === "sep"
            ? <DropdownMenuSeparator key={i} className="my-1 h-px bg-line" />
            : (
              <DropdownMenuHighlightItem key={i} disabled={it.disabled} activeClassName={it.danger ? "!bg-bad/12" : ""}>
                <DropdownMenuItem disabled={it.disabled} title={it.hint} onSelect={() => it.onSelect()}
                  className={`relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-1.5 outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40 ${it.danger ? "text-bad" : ""}`}>
                  <span className="flex w-4 justify-center text-mute">{it.icon}</span>{it.label}
                </DropdownMenuItem>
              </DropdownMenuHighlightItem>
            ))}
        </DropdownMenuHighlight>
      </DropdownMenuContent>
    </DropdownMenu>
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
 *  放在 aside（flex flex-col，清單包在 .side-list 裡自己捲動）的最後面，固定在左下角，清單不會從它底下穿過去。refreshKey 改變或分頁切回來時重抓數量。
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
    <div className="shrink-0 border-t border-line/60 px-4 pt-2 pb-4">
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
  const reduce = useReducedMotion();
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
    <Modal open={open} onClose={() => !busy && onClose()} label="垃圾桶">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-lg">垃圾桶</h3>
        {/* Animate UI Tabs：選中的藍色底會用彈簧滑到新分頁；方向鍵可切換 */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TrashKind)}>
          <TabsHighlight className="absolute inset-0 z-0 rounded-full bg-acc" transition={reduce ? { duration: 0 } : SPRING}>
            <TabsList className="flex rounded-full bg-panel2 p-1" aria-label="垃圾桶種類">
              {KINDS.map((k) => (
                <TabsHighlightItem key={k.kind} value={k.kind}>
                  <TabsTrigger value={k.kind}
                    className="relative z-[1] rounded-full px-3.5 py-1 text-sm text-mute outline-none transition-colors hover:text-text focus-visible:ring-3 focus-visible:ring-acc/40 data-[state=active]:text-on-acc data-[state=active]:hover:text-on-acc">
                    {k.noun}{items[k.kind].length > 0 && <span className="ml-1 tabular-nums opacity-80">{items[k.kind].length}</span>}
                  </TabsTrigger>
                </TabsHighlightItem>
              ))}
            </TabsList>
          </TabsHighlight>
        </Tabs>
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

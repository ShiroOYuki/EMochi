import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { stickersApi, type Sticker, type StickerGroup } from "../api";
import { reloadStickers, saveGroups, useStickers } from "../stickers";
import { Check, Modal, SPRING, Spinner } from "../components/ui";
import { MenuIcons, useContextMenu, type MenuItem } from "../components/ContextMenu";
import { TrashIcon } from "../components/icons";
import StickerEditor from "../components/StickerEditor";
import { toastError } from "../toast";

/** 拖曳中的表情：from＝來源分組 id，null＝從左邊「所有表情」拖出來 */
type Drag = { id: number; from: number | null };
/** 放下的位置：分組 id＋插在第幾張前面；pool＝拖回左邊（從分組拿掉） */
type Over = { gid: number; index: number } | { pool: true } | null;

/** 表情分頁：左邊是所有表情，右邊是分組；把小卡拖進分組，Gen 的挑選步驟就能一次勾一組 */
export default function StickersPage() {
  const { active: list, groups, deleted, loaded } = useStickers();
  const [q, setQ] = useState("");
  const [onlyUngrouped, setOnlyUngrouped] = useState(false);
  const [editing, setEditing] = useState<{ sticker: Sticker | null; group?: number } | null>(null);
  const [toDelete, setToDelete] = useState<Sticker | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<StickerGroup | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const drag = useRef<Drag | null>(null);
  const [over, setOver] = useState<Over>(null);
  const [menu, openMenu] = useContextMenu();

  const save = (next: StickerGroup[]) => {
    saveGroups(next).catch((e) => toastError(e, "分組儲存失敗"));
  };
  const clone = () => groups.map((g) => ({ ...g, ids: [...g.ids] }));
  const countIn = (id: number) => groups.filter((g) => g.ids.includes(id)).length;

  /** 放進分組 gid 的第 index 個位置；從別組拖來＝移動（按住 Ctrl＝複製），從左邊拖來＝加入 */
  const place = (d: Drag, gid: number, index: number, copy: boolean) => {
    const next = clone();
    const tgt = next.find((g) => g.id === gid);
    if (!tgt) return;
    if (d.from !== null && d.from !== gid && !copy) {
      const src = next.find((g) => g.id === d.from);
      if (src) src.ids = src.ids.filter((x) => x !== d.id);
    }
    const cur = tgt.ids.indexOf(d.id);
    if (cur >= 0) {
      tgt.ids.splice(cur, 1);
      if (cur < index) index--;
    }
    tgt.ids.splice(index, 0, d.id);
    save(next);
  };
  const removeFrom = (gid: number, id: number) =>
    save(clone().map((g) => (g.id === gid ? { ...g, ids: g.ids.filter((x) => x !== id) } : g)));
  const patchGroup = (gid: number, patch: Partial<StickerGroup>) =>
    save(groups.map((g) => (g.id === gid ? { ...g, ...patch } : g)));
  const moveGroup = (gid: number, dir: -1 | 1) => {
    const i = groups.findIndex((g) => g.id === gid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= groups.length) return;
    const next = [...groups];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const addGroup = () => {
    let n = groups.length + 1;
    while (groups.some((g) => g.name === `新分組 ${n}`)) n++;
    save([...groups, { id: 0, name: `新分組 ${n}`, ids: [], default: false }]);
  };

  // ---- 拖放 ----
  const start = (e: DragEvent, d: Drag) => {
    drag.current = d;
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData("text/plain", `#${d.id}`);
  };
  const end = () => {
    drag.current = null;
    setOver(null);
  };
  const overGroup = (e: DragEvent, gid: number, index: number) => {
    if (!drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = drag.current.from === null || e.ctrlKey ? "copy" : "move";
    setOver((o) => (o && "gid" in o && o.gid === gid && o.index === index ? o : { gid, index }));
  };
  const overCard = (e: DragEvent, gid: number, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    overGroup(e, gid, e.clientX < r.left + r.width / 2 ? i : i + 1);
  };
  const dropGroup = (e: DragEvent, gid: number) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag.current;
    const o = over;
    end();
    if (d && o && "gid" in o && o.gid === gid) place(d, gid, o.index, e.ctrlKey);
  };
  const overPool = (e: DragEvent) => {
    if (drag.current?.from == null) return; // 從左邊拖出來又放回左邊：不用處理
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver((o) => (o && "pool" in o ? o : { pool: true }));
  };
  const dropPool = (e: DragEvent) => {
    e.preventDefault();
    const d = drag.current;
    end();
    if (d && d.from !== null) removeFrom(d.from, d.id);
  };

  const menuFor = (s: Sticker, gid?: number): MenuItem[] => [
    { label: "編輯", icon: MenuIcons.open, onSelect: () => setEditing({ sticker: s }) },
    ...(gid !== undefined
      ? [
          {
            label: "從這個分組拿掉",
            icon: <span aria-hidden>－</span>,
            onSelect: () => removeFrom(gid, s.id),
          } as MenuItem,
        ]
      : []),
    ...(groups.length ? ["sep" as const] : []),
    ...groups
      .filter((g) => !g.ids.includes(s.id))
      .map((g): MenuItem => ({
        label: `加入「${g.name}」`,
        icon: <span aria-hidden>＋</span>,
        onSelect: () => place({ id: s.id, from: null }, g.id, g.ids.length, true),
      })),
    "sep",
    { label: "刪除表情", icon: MenuIcons.trash, danger: true, onSelect: () => setToDelete(s) },
  ];

  const kw = q.trim().toLowerCase();
  const pool = list.filter(
    (s) =>
      (!onlyUngrouped || countIn(s.id) === 0) &&
      (!kw || `#${s.id} ${s.label} ${s.zh} ${s.prompt}`.toLowerCase().includes(kw)),
  );
  const poolOver = over !== null && "pool" in over;

  return (
    <div className="flex h-full">
      {/* 左：所有表情（拖出去加入分組；把分組裡的拖回來＝從分組拿掉） */}
      <aside
        onDragOver={overPool}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setOver((o) => (o && "pool" in o ? null : o));
        }}
        onDrop={dropPool}
        className={`flex w-80 shrink-0 flex-col p-4 transition-colors ${poolOver ? "bg-bad/8" : ""}`}
      >
        <button className="btn btn-primary mb-3 w-full" onClick={() => setEditing({ sticker: null })}>
          ＋ 新增表情
        </button>
        <input
          className="input mb-2"
          placeholder="搜尋名稱、中文、描述…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mb-2 flex items-center gap-2 px-1 text-xs text-mute">
          <span>所有表情 {list.length}</span>
          <label className="ml-auto flex items-center gap-1.5">
            <Check checked={onlyUngrouped} onCheckedChange={setOnlyUngrouped} />
            只看未分組
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!loaded && (
            <div className="flex items-center gap-2 text-sm text-mute">
              <Spinner />
              載入中…
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {pool.map((s) => (
              <Card
                key={s.id}
                s={s}
                sub={countIn(s.id) ? `${countIn(s.id)} 組` : "未分組"}
                onDragStart={(e) => start(e, { id: s.id, from: null })}
                onDragEnd={end}
                onClick={() => setEditing({ sticker: s })}
                onContextMenu={(e) => openMenu(e, menuFor(s))}
              />
            ))}
          </div>
          {loaded && !pool.length && (
            <p className="mt-6 text-center text-xs text-mute">{kw ? "找不到符合的表情" : "全部都分好組了"}</p>
          )}
        </div>
        <p
          className={`mt-2 rounded-xl px-2 py-1.5 text-center text-[11px] transition ${poolOver ? "bg-bad/15 text-bad" : "text-mute"}`}
        >
          {poolOver ? "放開＝從那個分組拿掉（表情本身不會刪除）" : "點小卡編輯・右鍵有更多選項"}
        </p>
        <button
          className="mt-1 flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-xs text-mute hover:text-text"
          onClick={() => setShowDeleted(true)}
        >
          <TrashIcon size={13} />
          已刪除的表情 {deleted.length}
        </button>
      </aside>

      {/* 右：分組 */}
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg">表情分組</h2>
            <p className="text-xs text-mute">
              從左邊把表情拖進分組；分組之間拖曳是移動，按住 Ctrl 是複製。一個表情可以放在好幾組。
            </p>
            <button className="btn ml-auto" onClick={addGroup}>
              ＋ 新增分組
            </button>
          </div>
          {groups.map((g, gi) => (
            <GroupCard
              key={g.id}
              g={g}
              first={gi === 0}
              last={gi === groups.length - 1}
              overIndex={over && "gid" in over && over.gid === g.id ? over.index : null}
              onRename={(name) => patchGroup(g.id, { name })}
              onDefault={(v) => patchGroup(g.id, { default: v })}
              onMove={(d) => moveGroup(g.id, d)}
              onDelete={() =>
                g.ids.length ? setGroupToDelete(g) : save(groups.filter((x) => x.id !== g.id))
              }
              onAdd={() => setEditing({ sticker: null, group: g.id })}
              onDragOver={(e) => overGroup(e, g.id, g.ids.length)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setOver((o) => (o && "gid" in o && o.gid === g.id ? null : o));
              }}
              onDrop={(e) => dropGroup(e, g.id)}
            >
              {(s, i) => (
                <Card
                  key={s.id}
                  s={s}
                  sub={s.zh}
                  marker={
                    over && "gid" in over && over.gid === g.id
                      ? over.index === i
                        ? "before"
                        : over.index === i + 1 && i === g.ids.length - 1
                          ? "after"
                          : null
                      : null
                  }
                  onDragStart={(e) => start(e, { id: s.id, from: g.id })}
                  onDragEnd={end}
                  onDragOver={(e) => overCard(e, g.id, i)}
                  onClick={() => setEditing({ sticker: s })}
                  onContextMenu={(e) => openMenu(e, menuFor(s, g.id))}
                  onRemove={() => removeFrom(g.id, s.id)}
                />
              )}
            </GroupCard>
          ))}
          {loaded && !groups.length && (
            <p className="py-10 text-center text-sm text-mute">還沒有分組，按右上角「＋ 新增分組」開始。</p>
          )}
        </div>
      </div>

      {menu}
      <StickerEditor
        open={!!editing}
        sticker={editing?.sticker ?? null}
        defaultGroup={editing?.group}
        onClose={() => setEditing(null)}
        onDelete={(s) => {
          setEditing(null);
          setToDelete(s);
        }}
      />
      <ConfirmDelete
        sticker={toDelete}
        groups={groups}
        onClose={() => setToDelete(null)}
        onDone={() => reloadStickers()}
      />
      <Modal open={!!groupToDelete} onClose={() => setGroupToDelete(null)} label="刪除分組">
        {groupToDelete && (
          <div className="space-y-3">
            <h3 className="text-lg">刪除分組「{groupToDelete.name}」？</h3>
            <p className="text-sm text-mute">
              只會刪掉這個分組，裡面的 {groupToDelete.ids.length}{" "}
              個表情都還在（沒有其他分組的會變成「未分組」）。
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setGroupToDelete(null)}>
                取消
              </button>
              <button
                className="btn border-bad bg-bad text-white hover:border-bad hover:text-white"
                autoFocus
                onClick={() => {
                  save(groups.filter((x) => x.id !== groupToDelete.id));
                  setGroupToDelete(null);
                }}
              >
                刪除分組
              </button>
            </div>
          </div>
        )}
      </Modal>
      <DeletedList open={showDeleted} items={deleted} onClose={() => setShowDeleted(false)} />
    </div>
  );
}

// ---------- 小卡 ----------

function Card({
  s,
  sub,
  marker,
  onRemove,
  ...handlers
}: {
  s: Sticker;
  sub?: string;
  marker?: "before" | "after" | null;
  onRemove?: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver?: (e: DragEvent) => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div layout={!reduce} transition={SPRING} className="group relative">
      {marker && (
        <span
          aria-hidden
          className={`absolute top-1 bottom-1 z-10 w-[3px] rounded-full bg-pink ${marker === "before" ? "-left-[4px]" : "-right-[4px]"}`}
        />
      )}
      <button
        draggable
        onDragStart={handlers.onDragStart}
        onDragEnd={handlers.onDragEnd}
        onDragOver={handlers.onDragOver}
        onClick={handlers.onClick}
        onContextMenu={handlers.onContextMenu}
        title={s.prompt}
        className="flex w-full cursor-grab items-start rounded-xl border border-line bg-panel px-2.5 py-2 text-left text-xs transition hover:border-acc active:cursor-grabbing"
      >
        <span className="min-w-0 flex-1 pr-3">
          <span className="block truncate">
            #{s.id} {s.label}
          </span>
          <span className="block truncate text-mute">{sub}</span>
        </span>
        {s.align === "bottom" && (
          <span className="absolute right-1.5 bottom-1 text-[10px] text-mute" title="輸出時貼齊底邊">
            ⤓
          </span>
        )}
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`從分組拿掉 ${s.label}`}
          title="從這個分組拿掉"
          className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-panel text-[11px] text-mute opacity-0 transition group-hover:opacity-100 hover:bg-bad/15 hover:text-bad focus-visible:opacity-100"
        >
          ✕
        </button>
      )}
    </motion.div>
  );
}

// ---------- 分組卡 ----------

function GroupCard({
  g,
  first,
  last,
  overIndex,
  children,
  onRename,
  onDefault,
  onMove,
  onDelete,
  onAdd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  g: StickerGroup;
  first: boolean;
  last: boolean;
  overIndex: number | null;
  children: (s: Sticker, i: number) => ReactNode;
  onRename: (name: string) => void;
  onDefault: (v: boolean) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onAdd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const { byId } = useStickers();
  const [name, setName] = useState<string | null>(null); // null＝沒在改名
  const commit = () => {
    if (name !== null && name.trim() && name.trim() !== g.name) onRename(name.trim());
    setName(null);
  };
  const items = g.ids.map((i) => byId.get(i)).filter((s): s is Sticker => !!s);
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`card border-2 transition-colors ${overIndex !== null ? "border-pink/70" : "border-transparent"}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {name === null ? (
          <button
            className="rounded-lg px-1 text-base hover:bg-panel2"
            title="點一下改名"
            onClick={() => setName(g.name)}
          >
            {g.name}
          </button>
        ) : (
          <input
            className="input w-56 py-1"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setName(null);
            }}
          />
        )}
        <span className="text-xs text-mute">{items.length} 張</span>
        <label
          className="ml-3 flex items-center gap-1.5 text-xs text-mute"
          title="生成新專案時，「選擇貼圖」步驟預設勾選這組"
        >
          <Check checked={g.default} onCheckedChange={onDefault} />
          Gen 預設勾選
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-sm" onClick={onAdd}>
            ＋ 新表情
          </button>
          <button
            className="btn btn-sm px-2"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label="往上移"
            title="往上移"
          >
            ↑
          </button>
          <button
            className="btn btn-sm px-2"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label="往下移"
            title="往下移"
          >
            ↓
          </button>
          <button
            className="btn btn-sm px-2 text-mute hover:border-bad hover:text-bad"
            onClick={onDelete}
            aria-label={`刪除分組 ${g.name}`}
            title="刪除分組"
          >
            <TrashIcon size={13} />
          </button>
        </div>
      </div>
      {items.length ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-6">
          {items.map((s, i) => children(s, i))}
        </div>
      ) : (
        <div
          className={`rounded-2xl border-2 border-dashed py-6 text-center text-xs transition ${overIndex !== null ? "border-pink bg-pink-soft text-text" : "border-line text-mute"}`}
        >
          把左邊的表情拖到這裡
        </div>
      )}
    </section>
  );
}

// ---------- 刪除表情／已刪除清單 ----------

function ConfirmDelete({
  sticker,
  groups,
  onClose,
  onDone,
}: {
  sticker: Sticker | null;
  groups: StickerGroup[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inGroups = sticker ? groups.filter((g) => g.ids.includes(sticker.id)).map((g) => g.name) : [];
  const go = async () => {
    if (!sticker) return;
    setBusy(true);
    setErr("");
    try {
      await stickersApi.remove(sticker.id);
      onDone();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!sticker} onClose={() => !busy && onClose()} label="刪除表情">
      {sticker && (
        <div className="space-y-3">
          <h3 className="text-lg">
            刪除表情 #{sticker.id}「{sticker.label}」？
          </h3>
          <p className="text-sm text-mute">
            生成時就選不到它{inGroups.length ? `，也會從「${inGroups.join("」「")}」拿掉` : ""}
            。已經生成的成品留在圖庫；編號不會被新表情重用，之後可以從左下角「已刪除的表情」還原。
          </p>
          {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button
              className="btn border-bad bg-bad text-white hover:border-bad hover:text-white"
              onClick={go}
              disabled={busy}
              autoFocus
            >
              {busy ? "刪除中…" : "刪除"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DeletedList({ open, items, onClose }: { open: boolean; items: Sticker[]; onClose: () => void }) {
  const [err, setErr] = useState("");
  const restore = async (s: Sticker) => {
    setErr("");
    try {
      await stickersApi.restore(s.id);
      await reloadStickers();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal open={open} onClose={onClose} label="已刪除的表情">
      <div className="space-y-3">
        <h3 className="text-lg">已刪除的表情</h3>
        <p className="text-xs text-mute">還原後會回到「未分組」，需要的話再拖進分組。</p>
        {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  #{s.id} {s.label}
                  <span className="ml-2 text-xs text-mute">{s.zh}</span>
                </span>
                <button className="btn btn-sm" onClick={() => restore(s)}>
                  還原
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-mute">沒有已刪除的表情</p>
        )}
        <div className="flex justify-end">
          <button className="btn" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </Modal>
  );
}

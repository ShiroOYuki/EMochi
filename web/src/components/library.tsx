import { useCallback, useEffect, useState, type ReactNode } from "react";
import { readFiles, type CharImage, type RefLibraryApi, type Upload } from "../api";
import { DropZone } from "./ui";
import { MenuIcons, useContextMenu, type MenuItem } from "./ContextMenu";
import { SideDeleteIcon } from "./DeleteButton";
import { TrashButton } from "./Trash";
import { DeleteConfirm, type DeleteTarget } from "./confirm";
import { copyText } from "../lib/clipboard";

/** 角色庫、畫風庫兩頁共用：左側清單（新增鈕、右鍵選單、刪除確認、垃圾桶）、參考圖格、待上傳的圖 */

type Item = { id: string; updated: string; images: CharImage[]; error?: string };

/** 清單、目前選取、act（執行後重新整理並切過去）、刪除流程 */
export function useLibrary<T extends Item>({
  api,
  active,
  deleteWarn,
}: {
  /** charactersApi 或 styleLibApi */
  api: RefLibraryApi<T>;
  active: boolean;
  /** 刪除前要提醒的話（例如哪些專案用到這個角色）；沒有就回傳 undefined */
  deleteWarn?: (item: T) => Promise<ReactNode | undefined>;
}) {
  const [list, setList] = useState<T[]>([]);
  const [current, setCurrent] = useState<string | null>(null); // null = 新增
  const [newKey, setNewKey] = useState(0); // 每按一次「新增」+1，讓表單聚焦
  const [err, setErr] = useState("");
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const [trashKey, setTrashKey] = useState(0);

  const load = useCallback(async () => {
    const l = await api.list();
    setList(l);
    return l;
  }, [api]);
  useEffect(() => {
    if (!active) return;
    load().then((l) => setCurrent((c) => (c === null && l.length && newKey === 0 ? l[0].id : c)));
  }, [active, load, newKey]);

  /** 執行後重新整理清單並切到回傳的那筆；回傳帶 error（例如分析失敗）時仍切過去並顯示錯誤 */
  const act = async (fn: () => Promise<T>) => {
    setErr("");
    try {
      const x = await fn();
      await load();
      setCurrent(x.id);
      if (x.error) setErr(x.error);
      return x;
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const askDelete = async (x: T, title: string) =>
    setToDelete({ id: x.id, title, warn: await deleteWarn?.(x) });
  const doDelete = async (id: string) => {
    await api.remove(id);
    setTrashKey((k) => k + 1);
    const l = await load();
    if (current === id) setCurrent(l[0]?.id ?? null);
  };
  const startNew = () => {
    setCurrent(null);
    setNewKey((k) => k + 1);
  };
  const selected = list.find((x) => x.id === current) ?? null;
  return {
    list,
    current,
    setCurrent,
    selected,
    newKey,
    startNew,
    err,
    act,
    load,
    askDelete,
    doDelete,
    toDelete,
    setToDelete,
    trashKey,
  };
}

type Lib<T extends Item> = ReturnType<typeof useLibrary<T>>;

/** 左側清單 */
export function LibrarySidebar<T extends Item>({
  lib,
  noun,
  newLabel,
  heading,
  empty,
  trashKind,
  active,
  row,
}: {
  lib: Lib<T>;
  noun: string;
  newLabel: string;
  heading: string;
  empty?: ReactNode;
  trashKind: "characters" | "styles";
  active: boolean;
  row: (x: T) => { title: string; sub: ReactNode; cover?: string };
}) {
  const [menu, openMenu] = useContextMenu();
  const menuFor = (x: T, title: string): MenuItem[] => [
    { label: "開啟", icon: MenuIcons.open, onSelect: () => lib.setCurrent(x.id) },
    { label: `複製編號 ${x.id}`, icon: MenuIcons.copy, onSelect: () => copyText(x.id) },
    "sep",
    { label: "刪除", icon: MenuIcons.trash, danger: true, onSelect: () => lib.askDelete(x, title) },
  ];
  return (
    <aside className="flex w-64 shrink-0 flex-col">
      <div className="shrink-0 px-4 pt-4">
        <button
          className={`btn mb-3 w-full ${lib.current === null ? "btn-primary" : ""}`}
          onClick={lib.startNew}
        >
          ＋ {newLabel}
        </button>
        <div className="mb-1 px-1 text-xs text-mute">{heading}</div>
      </div>
      <div className="side-list">
        {lib.list.length === 0 && empty && <div className="px-1 text-xs text-mute">{empty}</div>}
        {lib.list.map((x) => {
          const r = row(x);
          return (
            <div
              key={x.id}
              className="group relative mb-1.5"
              onContextMenu={(e) => openMenu(e, menuFor(x, r.title))}
            >
              <button
                onClick={() => lib.setCurrent(x.id)}
                className={`flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 pr-9 text-left transition ${lib.current === x.id ? "border-acc bg-panel shadow-[var(--shadow-soft)]" : "border-transparent hover:bg-panel/70"}`}
              >
                {r.cover ? (
                  <img src={r.cover} className="checker size-10 rounded-xl object-cover" alt="" />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-xl bg-panel2 text-mute">
                    ?
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate">{r.title}</span>
                  <span className="text-[11px] text-mute">{r.sub}</span>
                </span>
              </button>
              <SideDeleteIcon
                onClick={() => lib.askDelete(x, r.title)}
                label={`刪除${noun} ${x.id}`}
                shown={lib.current === x.id}
              />
            </div>
          );
        })}
      </div>
      {menu}
      <DeleteConfirm
        target={lib.toDelete}
        noun={noun}
        onConfirm={lib.doDelete}
        onClose={() => lib.setToDelete(null)}
      />
      <TrashButton
        kind={trashKind}
        active={active}
        refreshKey={lib.trashKey}
        onRestored={(id) => {
          lib.load();
          lib.setCurrent(id);
        }}
      />
    </aside>
  );
}

/** 已存的參考圖：點圖切換「預設附上」（粉框）、移除、拖曳加圖 */
export function RefImageGrid<T>({
  images,
  url,
  api,
  id,
  act,
  toggleTitle,
}: {
  images: CharImage[];
  url: (file: string) => string;
  /** charactersApi 或 styleLibApi；每個操作都回傳更新後的整筆 */
  api: RefLibraryApi<T>;
  id: string;
  act: (fn: () => Promise<T>) => Promise<unknown>;
  toggleTitle: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {images.map((i) => (
        <div key={i.file} className="w-32">
          <button
            onClick={() => act(() => api.setImageUse(id, i.file, !i.use))}
            aria-pressed={i.use}
            title={toggleTitle}
            className={`checker block aspect-square w-full overflow-hidden rounded-xl border-[3px] transition ${i.use ? "border-pink" : "border-transparent opacity-50 hover:opacity-90"}`}
          >
            <img src={url(i.file)} className="size-full object-contain" alt={i.file} />
          </button>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-mute">
            <span className="truncate" title={i.source ? `原檔名：${i.source}` : undefined}>
              {i.file.replace(/\.png$/, "")}
            </span>
            <button
              className="ml-auto shrink-0 hover:text-bad"
              onClick={() => act(() => api.removeImage(id, i.file))}
            >
              移除
            </button>
          </div>
        </div>
      ))}
      <DropZone
        className="size-32"
        onFiles={async (files) => {
          const u = await readFiles(files);
          if (u.length) await act(() => api.addImages(id, u));
        }}
      />
    </div>
  );
}

/** 建立前挑好、還沒上傳的圖 */
export function PendingUploads({
  images,
  setImages,
  disabled,
}: {
  images: Upload[];
  setImages: (f: (x: Upload[]) => Upload[]) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {images.map((u, i) => (
        <div key={i} className="checker relative size-28 overflow-hidden rounded-xl">
          <img src={u.data} className="size-full object-contain" alt={u.name} />
          <button
            onClick={() => setImages((x) => x.filter((_, j) => j !== i))}
            aria-label={`移除 ${u.name}`}
            className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-panel/90 text-xs shadow hover:text-bad"
          >
            ✕
          </button>
        </div>
      ))}
      <DropZone
        className="size-28"
        disabled={disabled}
        onFiles={async (f) => {
          const u = await readFiles(f);
          setImages((x) => [...x, ...u]);
        }}
      />
    </>
  );
}

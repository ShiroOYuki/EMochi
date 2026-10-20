import { useCallback, useEffect, useMemo, useState } from "react";
import { fileUrl, galleryApi, type GalleryStyle } from "../api";
import { Modal, ScrollRow, Select } from "../components/ui";
import { useStored } from "../hooks/useStored";
import { useViewTransition } from "../hooks/useViewTransition";
import { Preview } from "./gallery/Preview";
import { keyOf, type Entry } from "./gallery/shared";
import { SidePanel } from "./gallery/SidePanel";
import {
  ALL_CHARACTERS,
  ALL_GROUPS,
  COMPARE_ALL,
  UNGROUPED,
  useGalleryFilters,
} from "./gallery/useGalleryFilters";

/** 圖庫：上方篩選（角色、畫風、組別），中間卡片（並排比較時依表情分組），右側勾選／匯出面板 */
export default function GalleryPage({ active }: { active: boolean }) {
  const [allStyles, setStyles] = useState<GalleryStyle[]>([]);
  const {
    mode,
    setMode,
    characterFilter,
    setCharacterFilter,
    characterOptions,
    group,
    setGroup,
    stickerGroups,
    styles,
    view,
    rows,
  } = useGalleryFilters(allStyles);
  const [selectedKeys, setSelectedKeys] = useStored<string[]>("gallery.sel", []);
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  // 並排比較：每組一列、橫向捲動（預設）；false＝自動換行（每組的寬度依畫風數決定）
  const [oneLine, setOneLine] = useStored<boolean>("gallery.oneLine", true);
  /** 大圖預覽開著的是 view 裡第幾張 */
  const [open, setOpen] = useState<number | null>(null);
  const { withTransition, vtName } = useViewTransition();

  const reload = useCallback(async () => setStyles(await galleryApi.list()), []);
  useEffect(() => {
    if (active) reload();
  }, [active, reload]);

  const select = (keys: string[], on: boolean) => {
    const next = new Set(selectedKeys);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    setSelectedKeys([...next]);
  };
  const toggle = (k: string) => select([k], !selected.has(k));

  // 大圖預覽：左右鍵切換、空白鍵勾選
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setOpen((i) => (i! - 1 + view.length) % view.length);
      if (e.key === "ArrowRight") setOpen((i) => (i! + 1) % view.length);
      if (e.key === " ") {
        e.preventDefault();
        toggle(keyOf(view[open]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const compare = mode === COMPARE_ALL;
  const card = (e: Entry, i: number) => {
    const k = keyOf(e);
    return (
      <GalleryCard
        key={k}
        entry={e}
        compare={compare}
        on={selected.has(k)}
        vtName={vtName(k)}
        onOpen={() => setOpen(i)}
        onToggle={() => toggle(k)}
      />
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* 篩選：角色、畫風（並排比較或單一套）、組別都用下拉；並排比較時可切換每組的排列方式 */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-3">
        {characterOptions.length > 1 && (
          <Select
            label="角色"
            className="!w-48 !py-1"
            value={characterFilter}
            onChange={(v) => withTransition(() => setCharacterFilter(v))}
            options={[
              { value: ALL_CHARACTERS, label: `全部角色（${allStyles.length} 套）` },
              ...characterOptions.map((o) => ({ value: o.id, label: `${o.name}（${o.count} 套）` })),
            ]}
          />
        )}
        <Select
          label="畫風"
          className="!w-60 !py-1"
          value={mode}
          onChange={(v) => withTransition(() => setMode(v))}
          options={[
            { value: COMPARE_ALL, label: `並排比較（全部 ${styles.length} 套）` },
            ...styles.map((s) => ({
              value: s.id,
              label: `${s.id}${s.name ? ` ${s.name}` : ""}（${s.items.length} 張）`,
            })),
          ]}
        />
        <Select
          label="組別"
          className="!w-40 !py-1"
          value={group}
          onChange={(g) => withTransition(() => setGroup(g))}
          options={[
            { value: ALL_GROUPS, label: "全部組別" },
            ...stickerGroups.map((g) => ({ value: g.id, label: g.name })),
            { value: UNGROUPED, label: "未分組" },
          ]}
        />
        {rows && (
          <div
            className="flex items-center rounded-full bg-panel2 p-0.5 text-xs"
            role="radiogroup"
            aria-label="每組的排列方式"
          >
            {(
              [
                [true, "單行", "每組一列，放不下的用左右箭頭翻頁"],
                [false, "換行", "每組的卡片依寬度自動換行"],
              ] as const
            ).map(([v, label, hint]) => (
              <button
                key={label}
                role="radio"
                aria-checked={oneLine === v}
                title={hint}
                onClick={() => oneLine !== v && withTransition(() => setOneLine(v))}
                className={`rounded-full px-3 py-1 transition ${oneLine === v ? "bg-panel text-text shadow-[var(--shadow-soft)]" : "text-mute hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button className="btn btn-sm" onClick={() => select(view.map(keyOf), true)}>
          全選此頁
        </button>
        <button className="btn btn-sm" onClick={() => select(view.map(keyOf), false)}>
          取消此頁
        </button>
        <button
          className="btn btn-sm"
          onClick={() =>
            setSelectedKeys(
              view
                .map(keyOf)
                .filter((k) => !selected.has(k))
                .concat(selectedKeys.filter((k) => !view.some((e) => keyOf(e) === k))),
            )
          }
        >
          反選此頁
        </button>
        <button className="btn btn-sm" onClick={() => setSelectedKeys([])}>
          清空全部
        </button>
        <button className="btn btn-sm" onClick={reload}>
          重新整理
        </button>
        <span className="ml-auto text-sm text-mute">已勾選 {selected.size} 張</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="scroll-inset-panel min-w-0 flex-1 overflow-y-auto p-4">
          {allStyles.length === 0 && (
            <p className="text-mute">還沒有成品。到「生成」分頁完成一套畫風後就會出現在這裡。</p>
          )}
          {rows ? (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: oneLine
                  ? "minmax(0, 1fr)"
                  : `repeat(auto-fill, minmax(min(100%, ${Math.max(300, styles.length * 142 + 24)}px), 1fr))`,
              }}
            >
              {rows.map((r) => {
                const it0 = r.entries[0].it,
                  start = view.indexOf(r.entries[0]);
                const keys = r.entries.map(keyOf);
                return (
                  <div
                    key={r.id}
                    className="rounded-[22px] bg-panel p-3.5 shadow-[var(--shadow-soft)]"
                    data-vt={`gr-${r.id}`}
                  >
                    {/* 標題列不換行：名稱、按鈕固定一行；中文說明放不下就截斷成「…」，滑過看完整（Tooltip） */}
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span className="shrink-0 whitespace-nowrap">
                        #{r.id} {it0.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-mute" title={it0.zh}>
                        {it0.zh}
                      </span>
                      <button
                        className="btn btn-sm shrink-0 whitespace-nowrap"
                        onClick={() => select(keys, true)}
                      >
                        全選此組
                      </button>
                      <button
                        className="btn btn-sm shrink-0 whitespace-nowrap"
                        onClick={() => select(keys, false)}
                      >
                        取消此組
                      </button>
                    </div>
                    {oneLine ? (
                      <ScrollRow arrows className="snap-x snap-proximity gap-2.5 overscroll-x-contain">
                        {r.entries.map((e, j) => card(e, start + j))}
                      </ScrollRow>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {r.entries.map((e, j) => card(e, start + j))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">{view.map(card)}</div>
          )}
        </div>
        <SidePanel sel={selectedKeys} setSel={setSelectedKeys} styles={allStyles} />
      </div>

      <Modal open={open !== null && !!view[open]} onClose={() => setOpen(null)}>
        {open !== null && view[open] && (
          <Preview
            e={view[open]}
            on={selected.has(keyOf(view[open]))}
            onToggle={() => toggle(keyOf(view[open]))}
            onPrev={() => setOpen((open - 1 + view.length) % view.length)}
            onNext={() => setOpen((open + 1) % view.length)}
          />
        )}
      </Modal>
    </div>
  );
}

/** 一張貼圖卡片：左上勾選、右上畫風（並排比較）或表情編號（單一畫風） */
function GalleryCard({
  entry: e,
  compare,
  on,
  vtName,
  onOpen,
  onToggle,
}: {
  entry: Entry;
  compare: boolean;
  on: boolean;
  vtName: string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      data-vt={vtName}
      className={`sticker-card relative w-[136px] shrink-0 snap-start cursor-pointer rounded-[20px] border-2 p-2.5 pt-3 text-center ${on ? "sticker-on border-pink bg-pink-soft" : "border-transparent bg-panel2 hover:border-line"}`}
    >
      <button
        aria-label={on ? "取消勾選" : "勾選"}
        onClick={(ev) => {
          ev.stopPropagation();
          onToggle();
        }}
        className={`absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-full border-2 text-xs transition ${on ? "border-pink bg-pink text-white" : "border-line bg-panel text-transparent hover:border-pink"}`}
      >
        ✓
      </button>
      <span className="absolute right-2 top-2 z-10 rounded-full bg-panel px-2 text-[11px] text-mute">
        {compare ? e.s.id : `#${e.it.id}`}
      </span>
      <img
        loading="lazy"
        decoding="async"
        alt=""
        src={fileUrl(`outputs/${e.it.files.t112 ?? e.it.files.master}`, e.it.mtime)}
        className="sticker-img mx-auto mb-1.5 size-28"
      />
      <div className="truncate text-xs text-mute">{compare ? e.s.name || e.s.id : e.it.label}</div>
    </div>
  );
}

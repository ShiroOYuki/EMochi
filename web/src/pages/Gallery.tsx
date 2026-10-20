import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useReducedMotion } from "motion/react";
import {
  galleryApi,
  fileUrl,
  type CustomExport,
  type GalleryItem,
  type GalleryStyle,
  type SelectionInfo,
} from "../api";
import { ManagePresetsButton, PresetPicker } from "../components/ExportPresets";
import { legacyToPresets, parseSizes, sizeText, usePresets } from "../exportPresets";
import { Check, Modal, ScrollRow, Select } from "../components/ui";
import { useStickers } from "../stickers";

const KIND: Record<string, string> = { export: "匯出", combine: "組合", selection: "勾選" };
type Entry = { s: GalleryStyle; it: GalleryItem };
const keyOf = (e: Entry) => `${e.s.id}:${e.it.id}`;
const VT_MAX = 120; // 一次最多替幾個元素做位置動畫（只算畫面上看得到的）

function useStored<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* 私密模式等情況忽略 */
    }
  }, [key, v]);
  return [v, setV] as const;
}

export default function GalleryPage({ active }: { active: boolean }) {
  const [allStyles, setStyles] = useState<GalleryStyle[]>([]);
  const [mode, setMode] = useStored<string>("gallery.mode", "__all");
  // 角色過濾：__all ＝ 全部；__none ＝ 沒指定角色的畫風；其他 ＝ 角色 id
  const [charF, setCharF] = useStored<string>("gallery.char", "__all");
  const charOpts = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const s of allStyles) {
      const id = s.character_id ?? "__none";
      const o = m.get(id) ?? {
        id,
        name: s.character_id ? s.character_name || s.character_id : "未指定角色",
        n: 0,
      };
      o.n += 1;
      m.set(id, o);
    }
    return [...m.values()];
  }, [allStyles]);
  const styles = useMemo(
    () => (charF === "__all" ? allStyles : allStyles.filter((s) => (s.character_id ?? "__none") === charF)),
    [allStyles, charF],
  );
  // 換了角色、原本選的畫風不在清單裡 → 回到並排比較
  useEffect(() => {
    if (mode !== "__all" && allStyles.length && !styles.some((s) => s.id === mode)) setMode("__all");
  }, [styles, allStyles.length, mode, setMode]);
  // 組別篩選：用「表情」分頁的分組（0＝全部、-1＝不在任何分組；其他＝分組 id）
  const { groups: stickerGroups } = useStickers();
  const [group, setGroup] = useState(0);
  useEffect(() => {
    if (group > 0 && !stickerGroups.some((g) => g.id === group)) setGroup(0);
  }, [stickerGroups, group]);
  const inGroup = useMemo(() => {
    if (group === 0) return null;
    if (group === -1) {
      const all = new Set(stickerGroups.flatMap((g) => g.ids));
      return (id: number) => !all.has(id);
    }
    const ids = new Set(stickerGroups.find((g) => g.id === group)?.ids ?? []);
    return (id: number) => ids.has(id);
  }, [group, stickerGroups]);
  const [selArr, setSelArr] = useStored<string[]>("gallery.sel", []);
  // 並排比較：每組一列、橫向捲動（預設）；false＝舊的自動換行（每組的寬度依畫風數決定）
  const [oneLine, setOneLine] = useStored<boolean>("gallery.oneLine", true);
  const sel = useMemo(() => new Set(selArr), [selArr]);
  const [open, setOpen] = useState<number | null>(null);

  const reload = useCallback(async () => setStyles(await galleryApi.list()), []);
  useEffect(() => {
    if (active) reload();
  }, [active, reload]);

  const ok = (it: GalleryItem) => !inGroup || inGroup(it.id);
  // 單一畫風：該畫風全部；並排比較：依貼圖編號分組
  const { view, rows } = useMemo(() => {
    if (mode !== "__all") {
      const s = styles.find((x) => x.id === mode) ?? styles[0];
      const v = s ? s.items.filter(ok).map((it) => ({ s, it })) : [];
      return { view: v, rows: null as null | { id: number; entries: Entry[] }[] };
    }
    const ids = [...new Set(styles.flatMap((s) => s.items.filter(ok).map((i) => i.id)))].sort(
      (a, b) => a - b,
    );
    const rs = ids.map((id) => ({
      id,
      entries: styles.flatMap((s) => {
        const it = s.items.find((x) => x.id === id);
        return it ? [{ s, it }] : [];
      }),
    }));
    return { view: rs.flatMap((r) => r.entries), rows: rs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, mode, inGroup]);

  const setSel = (keys: string[], on: boolean) => {
    const next = new Set(selArr);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    setSelArr([...next]);
  };
  const toggle = (k: string) => setSel([k], !sel.has(k));

  // 切換角色／畫風／組別時，用瀏覽器原生的 View Transitions 讓卡片滑到新位置（留下的滑過去、消失的淡出、新的淡入）。
  // 只替「畫面上看得到的」卡片命名（切換前後各量一次），畫面外的直接換，所以幾百張也不會卡；
  // 動畫結束就把名字清掉。系統設定減少動態效果時直接切換
  const reduce = useReducedMotion();
  const canVT = !reduce && "startViewTransition" in document;
  const withVT = (fn: () => void) => {
    if (!canVT) return fn();
    const els = () => document.querySelectorAll<HTMLElement>("[data-vt]");
    const nameVisible = () => {
      let n = 0;
      els().forEach((el) => {
        const r = el.getBoundingClientRect();
        const vis = r.width > 0 && r.bottom > -80 && r.top < innerHeight + 80 && n < VT_MAX;
        if (vis) n++;
        el.style.viewTransitionName = vis ? el.dataset.vt! : "";
      });
    };
    nameVisible();
    const t = document.startViewTransition(() => {
      flushSync(fn);
      nameVisible();
    });
    t.finished.finally(() =>
      els().forEach((el) => {
        el.style.viewTransitionName = "";
      }),
    );
  };
  const vtKey = (k: string) => `g-${k.replace(/[^\w-]/g, "_")}`;

  useEffect(() => {
    if (open === null) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setOpen((i) => (i! - 1 + view.length) % view.length);
      if (e.key === "ArrowRight") setOpen((i) => (i! + 1) % view.length);
      if (e.key === " ") {
        e.preventDefault();
        toggle(keyOf(view[open]));
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const card = (e: Entry, i: number) => {
    const k = keyOf(e),
      on = sel.has(k);
    return (
      <div
        key={k}
        onClick={() => setOpen(i)}
        data-vt={vtKey(k)}
        className={`sticker-card relative w-[136px] shrink-0 snap-start cursor-pointer rounded-[20px] border-2 p-2.5 pt-3 text-center ${on ? "sticker-on border-pink bg-pink-soft" : "border-transparent bg-panel2 hover:border-line"}`}
      >
        <button
          aria-label={on ? "取消勾選" : "勾選"}
          onClick={(ev) => {
            ev.stopPropagation();
            toggle(k);
          }}
          className={`absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-full border-2 text-xs transition ${on ? "border-pink bg-pink text-white" : "border-line bg-panel text-transparent hover:border-pink"}`}
        >
          ✓
        </button>
        <span className="absolute right-2 top-2 z-10 rounded-full bg-panel px-2 text-[11px] text-mute">
          {mode === "__all" ? e.s.id : `#${e.it.id}`}
        </span>
        <img
          loading="lazy"
          decoding="async"
          alt=""
          src={fileUrl(`outputs/${e.it.files.t112 ?? e.it.files.master}`, e.it.mtime)}
          className="sticker-img mx-auto mb-1.5 size-28"
        />
        <div className="truncate text-xs text-mute">{mode === "__all" ? e.s.name || e.s.id : e.it.label}</div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* 篩選：角色、畫風（並排比較或單一套）、組別都用下拉；並排比較時可切換每組的排列方式 */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-3">
        {charOpts.length > 1 && (
          <Select
            label="角色"
            className="!w-48 !py-1"
            value={charF}
            onChange={(v) => withVT(() => setCharF(v))}
            options={[
              { value: "__all", label: `全部角色（${allStyles.length} 套）` },
              ...charOpts.map((o) => ({ value: o.id, label: `${o.name}（${o.n} 套）` })),
            ]}
          />
        )}
        <Select
          label="畫風"
          className="!w-60 !py-1"
          value={mode}
          onChange={(v) => withVT(() => setMode(v))}
          options={[
            { value: "__all", label: `並排比較（全部 ${styles.length} 套）` },
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
          onChange={(g) => withVT(() => setGroup(g))}
          options={[
            { value: 0, label: "全部組別" },
            ...stickerGroups.map((g) => ({ value: g.id, label: g.name })),
            { value: -1, label: "未分組" },
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
                onClick={() => oneLine !== v && withVT(() => setOneLine(v))}
                className={`rounded-full px-3 py-1 transition ${oneLine === v ? "bg-panel text-text shadow-[var(--shadow-soft)]" : "text-mute hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button className="btn btn-sm" onClick={() => setSel(view.map(keyOf), true)}>
          全選此頁
        </button>
        <button className="btn btn-sm" onClick={() => setSel(view.map(keyOf), false)}>
          取消此頁
        </button>
        <button
          className="btn btn-sm"
          onClick={() =>
            setSelArr(
              view
                .map(keyOf)
                .filter((k) => !sel.has(k))
                .concat(selArr.filter((k) => !view.some((e) => keyOf(e) === k))),
            )
          }
        >
          反選此頁
        </button>
        <button className="btn btn-sm" onClick={() => setSelArr([])}>
          清空全部
        </button>
        <button className="btn btn-sm" onClick={reload}>
          重新整理
        </button>
        <span className="ml-auto text-sm text-mute">已勾選 {sel.size} 張</span>
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
                        onClick={() => setSel(keys, true)}
                      >
                        全選此組
                      </button>
                      <button
                        className="btn btn-sm shrink-0 whitespace-nowrap"
                        onClick={() => setSel(keys, false)}
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
        <SidePanel sel={selArr} setSel={setSelArr} styles={allStyles} />
      </div>

      <Modal open={open !== null && !!view[open]} onClose={() => setOpen(null)}>
        {open !== null && view[open] && (
          <Preview
            e={view[open]}
            on={sel.has(keyOf(view[open]))}
            onToggle={() => toggle(keyOf(view[open]))}
            onPrev={() => setOpen((open - 1 + view.length) % view.length)}
            onNext={() => setOpen((open + 1) % view.length)}
          />
        )}
      </Modal>
    </div>
  );
}

function Preview({
  e,
  on,
  onToggle,
  onPrev,
  onNext,
}: {
  e: Entry;
  on: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const f = e.it.files;
  const sizes = (bg: string) => (
    <div className={`flex items-center gap-3 rounded-lg p-3 ${bg}`}>
      {(["t112", "t56", "t28"] as const)
        .filter((k) => f[k])
        .map((k) => {
          const px = +k.slice(1);
          return (
            <img key={k} src={fileUrl(`outputs/${f[k]}`, e.it.mtime)} style={{ width: px, height: px }} />
          );
        })}
    </div>
  );
  return (
    <>
      <h3 className="mb-3">
        {e.s.id} #{e.it.id} {e.it.label}
        <span className="ml-2 text-sm font-normal text-mute">{e.it.zh}</span>
      </h3>
      <div className="flex flex-wrap items-start gap-5">
        <img src={fileUrl(`outputs/${f.master}`, e.it.mtime)} className="checker size-64 rounded-lg" />
        <div className="space-y-2">
          {sizes("bg-[#313338]")}
          {sizes("bg-white border border-line")}
          <p className="text-xs text-mute">實際尺寸 112 / 56 / 28（Discord 深色、白色背景）</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button className="btn" onClick={onPrev}>
          上一張
        </button>
        <label className="flex items-center gap-2 text-sm">
          <Check checked={on} onCheckedChange={onToggle} />
          勾選這張（空白鍵）
        </label>
        <button className="btn" onClick={onNext}>
          下一張
        </button>
      </div>
    </>
  );
}

// ---------- 右側：勾選清單 / 匯出 / 組合 ----------

function SidePanel({
  sel,
  setSel,
  styles,
}: {
  sel: string[];
  setSel: (k: string[]) => void;
  styles: GalleryStyle[];
}) {
  // 匯出用哪幾組預設集；舊版存的是格式代號（gallery.fmts），第一次載入時換成預設集 id
  const [chosen, setChosen] = useStored<string[]>(
    "gallery.presets",
    (() => {
      try {
        const old = JSON.parse(localStorage.getItem("gallery.fmts") ?? "null");
        if (Array.isArray(old)) return legacyToPresets(old);
      } catch {
        /* 忽略 */
      }
      return ["twitch", "discord"];
    })(),
  );
  // 「自訂」：只用在這次匯出，不存成預設集（欄位內容記在這台電腦，下次不用重打）
  const [useCustom, setUseCustom] = useStored("gallery.useCustom", false);
  const [cust, setCust] = useStored("gallery.custom", {
    sizes: "256",
    mode: "fit" as CustomExport["mode"],
    margin: 0,
    max_kb: "",
  });
  const { presets } = usePresets();
  const custSizes = parseSizes(cust.sizes);
  const customBody: CustomExport | null =
    useCustom && custSizes
      ? {
          sizes: custSizes,
          mode: cust.mode,
          margin: cust.margin,
          even: false,
          max_kb: cust.max_kb === "" ? null : Math.max(1, +cust.max_kb),
        }
      : null;
  const validChosen = chosen.filter((id) => presets.some((p) => p.id === id));
  const canExport = validChosen.length > 0 || !!customBody;
  const [tag, setTag] = useStored("gallery.tag", "");
  const [cmb, setCmb] = useStored("gallery.combine", {
    cols: 8,
    cell: 128,
    gap: 8,
    bg: "transparent",
    labels: false,
  });
  const [list, setList] = useState<SelectionInfo[]>([]);
  const [pick, setPick] = useState("");
  const [merge, setMerge] = useState(false);
  const [msg, setMsg] = useState({ sel: "", exp: "", cmb: "" });
  const [sheet, setSheet] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const l = await galleryApi.selections();
    setList(l);
    setPick((p) => p || l[0]?.file || "");
  }, []);
  useEffect(() => {
    loadList();
  }, [loadList]);

  const cleanTag = tag.replace(/[^A-Za-z0-9_-]/g, "");
  const say = (k: keyof typeof msg, v: string) => setMsg((m) => ({ ...m, [k]: v }));

  const apply = (d: Record<string, unknown>, src: string) => {
    const keys =
      (d.keys as string[] | undefined) ??
      ((d.items as { key: string }[] | undefined) ?? []).map((i) => i.key);
    const valid = new Set(styles.flatMap((s) => s.items.map((it) => `${s.id}:${it.id}`)));
    const okKeys = keys.filter((k) => valid.has(k));
    setSel(merge ? [...new Set([...sel, ...okKeys])] : okKeys);
    if (Array.isArray(d.presets)) setChosen(d.presets as string[]);
    else if (Array.isArray(d.formats)) setChosen(legacyToPresets(d.formats as string[])); // 舊版清單
    if (d.custom && typeof d.custom === "object") {
      const c = d.custom as CustomExport;
      setUseCustom(true);
      setCust({
        sizes: c.sizes.map(sizeText).join(", ").replace(/×/g, "x"),
        mode: c.mode,
        margin: c.margin ?? 0,
        max_kb: c.max_kb ? String(c.max_kb) : "",
      });
    }
    const t = (d.tag as string) ?? (typeof d.version === "string" ? d.version : null);
    if (typeof t === "string") setTag(t);
    if (d.combine) setCmb({ ...cmb, ...(d.combine as object) });
    const miss = keys.length - okKeys.length;
    say("sel", `已從 ${src} 載入 ${okKeys.length} 張${miss ? `（${miss} 張找不到，已略過）` : ""}`);
  };

  return (
    <aside className="scroll-inset m-3 ml-0 w-80 shrink-0 space-y-4 overflow-y-auto rounded-[22px] bg-panel p-5 text-sm shadow-[var(--shadow-soft)]">
      <div>
        <h3 className="mb-2">勾選清單（JSON）</h3>
        <Select
          label="勾選清單"
          value={pick}
          onChange={setPick}
          disabled={list.length === 0}
          placeholder={list.length === 0 ? "（還沒有存過的清單）" : "選擇清單"}
          options={list.map((x) => ({
            value: x.file,
            label: `${x.created || x.file}（${KIND[x.kind] ?? "清單"}，${x.count} 張${x.tag ? `，${x.tag}` : ""}）`,
          }))}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="btn"
            disabled={!pick}
            onClick={async () => apply(await galleryApi.selection(pick), pick)}
          >
            載入勾選
          </button>
          <button
            className="btn"
            disabled={!sel.length}
            onClick={async () => {
              const r = await galleryApi.saveSelection({
                keys: sel,
                presets: validChosen,
                custom: customBody,
                combine: cmb,
                tag: cleanTag,
              });
              say("sel", `已存成 exports\\${r.file}`);
              loadList();
            }}
          >
            儲存目前勾選
          </button>
        </div>
        <label className="btn mt-2 w-full cursor-pointer">
          從檔案讀取…
          <input
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                apply(JSON.parse(await f.text()), f.name);
              } catch (err) {
                say("sel", `JSON 格式錯誤：${(err as Error).message}`);
              }
              e.target.value = "";
            }}
          />
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs text-mute">
          <Check checked={merge} onCheckedChange={setMerge} />
          載入時加到現有勾選（不取代）
        </label>
        <p className="mt-1 text-xs text-mute">{msg.sel || "每次匯出、組合也會自動存一份 JSON"}</p>
      </div>

      <hr className="border-line" />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3>匯出（ZIP）</h3>
          <ManagePresetsButton className="btn btn-sm">管理預設集…</ManagePresetsButton>
        </div>
        <PresetPicker chosen={validChosen} onChange={setChosen} />
        <div className="mt-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-panel2/60">
            <Check className="mt-0.5" checked={useCustom} onCheckedChange={setUseCustom} />
            <span>
              <span className="block">自訂</span>
              <span className="block text-[11px] text-mute">只用這一次，不會存成預設集</span>
            </span>
          </label>
        </div>
        {useCustom && (
          <div className="mt-1 space-y-2 rounded-xl bg-panel2 p-3">
            <label className="label">
              尺寸（px，逗號分隔；長方形寫 寬x高）
              <input
                className={`input mt-1 font-mono ${custSizes ? "" : "!border-bad"}`}
                placeholder="例如 256, 300x200"
                value={cust.sizes}
                onChange={(e) => setCust({ ...cust, sizes: e.target.value })}
              />
            </label>
            {!custSizes && (
              <p className="text-[11px] text-bad">格式不對：每個尺寸 8～2048，例如 256 或 300x200</p>
            )}
            <div className="flex gap-2">
              <div className="label flex-1">
                縮放
                <Select
                  label="縮放方式"
                  className="mt-1 !py-1"
                  value={cust.mode}
                  onChange={(mode) => setCust({ ...cust, mode })}
                  options={[
                    { value: "fit", label: "等比縮進框內" },
                    { value: "canvas", label: "固定畫布置中" },
                  ]}
                />
              </div>
              <label className="label w-20">
                留白 px
                <input
                  className="input mt-1 !py-1"
                  type="number"
                  min={0}
                  max={256}
                  value={cust.margin}
                  onChange={(e) => setCust({ ...cust, margin: Math.max(0, +e.target.value) })}
                />
              </label>
            </div>
            <label className="label">
              檔案大小上限（KB，選填）
              <input
                className="input mt-1 !py-1"
                type="number"
                min={1}
                placeholder="不限"
                value={cust.max_kb}
                onChange={(e) => setCust({ ...cust, max_kb: e.target.value })}
              />
            </label>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0">版本標記</span>
          <input
            className="input"
            placeholder="選填，如 v1"
            maxLength={20}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </div>
        <p className="mt-1 text-xs text-mute">檔名範例：01_happy_s1{cleanTag ? `_${cleanTag}` : ""}.png</p>
        <button
          className="btn btn-primary mt-2 w-full"
          disabled={!sel.length || !canExport}
          onClick={async () => {
            say("exp", "匯出中…");
            try {
              const r = await galleryApi.export({
                keys: sel,
                presets: validChosen,
                custom: customBody,
                tag: cleanTag,
              });
              // 每組預設集的大小上限檢查：有壓縮或問題就列出來
              const notes = r.issues.flatMap((i) => i.notes.map((n) => `・${i.file}：${n}`));
              say(
                "exp",
                `完成：${r.count} 個檔案，存在 exports\\${r.file}` +
                  (notes.length
                    ? `\n規格檢查有 ${notes.length} 則提醒：\n${notes.slice(0, 8).join("\n")}${notes.length > 8 ? `\n…其餘 ${notes.length - 8} 則寫在同名的 JSON 裡` : ""}`
                    : "\n大小檢查：全部符合各預設集的上限"),
              );
              location.href = fileUrl(`exports/${r.file}`);
              loadList();
            } catch (e) {
              say("exp", `失敗：${(e as Error).message}`);
            }
          }}
        >
          匯出勾選的 {sel.length} 張
        </button>
        {msg.exp && <p className="mt-1 whitespace-pre-line break-all text-xs text-mute">{msg.exp}</p>}
      </div>

      <hr className="border-line" />
      <div>
        <h3 className="mb-2">組合成一張圖</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="label">
            欄數
            <input
              className="input mt-1"
              type="number"
              min={1}
              max={32}
              value={cmb.cols}
              onChange={(e) => setCmb({ ...cmb, cols: +e.target.value })}
            />
          </label>
          <div className="label">
            格子 px
            <Select
              label="格子 px"
              className="mt-1"
              value={cmb.cell}
              onChange={(n) => setCmb({ ...cmb, cell: n })}
              options={[56, 112, 128, 256, 512].map((n) => ({ value: n, label: n }))}
            />
          </div>
          <label className="label">
            間距 px
            <input
              className="input mt-1"
              type="number"
              min={0}
              max={64}
              value={cmb.gap}
              onChange={(e) => setCmb({ ...cmb, gap: +e.target.value })}
            />
          </label>
          <div className="label">
            背景
            <Select
              label="背景"
              className="mt-1"
              value={cmb.bg}
              onChange={(bg) => setCmb({ ...cmb, bg })}
              options={[
                { value: "transparent", label: "透明" },
                { value: "dark", label: "Discord 深色" },
                { value: "light", label: "白色" },
              ]}
            />
          </div>
        </div>
        <label className="mt-2 flex items-center gap-2">
          <Check checked={cmb.labels} onCheckedChange={(v) => setCmb({ ...cmb, labels: v })} />
          顯示名稱
        </label>
        <button
          className="btn mt-2 w-full"
          disabled={!sel.length}
          onClick={async () => {
            say("cmb", "組合中…");
            try {
              const r = await galleryApi.combine(sel, cmb);
              say("cmb", `完成，存在 exports\\${r.file}`);
              setSheet(r.file);
              loadList();
            } catch (e) {
              say("cmb", `失敗：${(e as Error).message}`);
            }
          }}
        >
          組合勾選的貼圖
        </button>
        {msg.cmb && <p className="mt-1 break-all text-xs text-mute">{msg.cmb}</p>}
        {sheet && (
          <a href={fileUrl(`exports/${sheet}`, sheet)} download>
            <img src={fileUrl(`exports/${sheet}`, sheet)} className="checker mt-2 rounded-md" />
          </a>
        )}
      </div>
      <p className="text-xs text-mute">所有檔案也會存到專案的 exports\ 資料夾</p>
    </aside>
  );
}

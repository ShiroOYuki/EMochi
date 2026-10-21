import { useCallback, useEffect, useState } from "react";
import { galleryApi, fileUrl, type CustomExport, type GalleryStyle, type SelectionInfo } from "../../api";
import { ManagePresetsButton, PresetPicker } from "../../components/ExportPresets";
import { Check, Select } from "../../components/ui";
import { legacyToPresets, parseSizes, sizeText, usePresets } from "../../exportPresets";
import { useStored } from "../../hooks/useStored";
import { toast, toastError } from "../../toast";

/** 圖庫右側：勾選清單（存／讀）、匯出 zip、組合總覽圖 */

const KIND: Record<string, string> = { export: "匯出", combine: "組合", selection: "勾選" };

export function SidePanel({
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
              toast.ok({
                title: "匯出完成",
                body:
                  `${r.count} 個檔案，存在 exports\\${r.file}` +
                  (notes.length ? `\n規格檢查有 ${notes.length} 則提醒，詳情見側欄的匯出區` : ""),
              });
              location.href = fileUrl(`exports/${r.file}`);
              loadList();
            } catch (e) {
              say("exp", `失敗：${(e as Error).message}`);
              toastError(e, "匯出失敗");
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

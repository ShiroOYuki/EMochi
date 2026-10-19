import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ExportPreset } from "../api";
import { resetPresets, savePresets, sizeText, usePresets } from "../exportPresets";
import { Check, Modal } from "./ui";

const blank = (n: number): ExportPreset => ({
  id: `preset_${n}`, name: "新預設集", folder: `preset_${n}`, sizes: [{ w: 128, h: 128 }],
  mode: "fit", margin: 0, even: false, max_kb: null, naming: "keep", note: "",
});

/** 一組預設集的摘要：尺寸、上限 */
export function presetSummary(p: Pick<ExportPreset, "sizes" | "max_kb" | "mode">) {
  return `${p.sizes.map(sizeText).join("／")}${p.mode === "canvas" ? "（畫布）" : ""}${p.max_kb ? `・≤ ${p.max_kb >= 1024 && p.max_kb % 1024 === 0 ? `${p.max_kb / 1024} MB` : `${p.max_kb} KB`}` : ""}`;
}

/** 打開預設集管理視窗的按鈕（匯出面板、設定頁共用） */
export function ManagePresetsButton({ className = "btn btn-sm", children = "管理…" }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children}</button>
      <PresetManager open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 匯出預設集管理：新增、複製、編輯、刪除、還原內建；改完按「儲存」才寫回 */
export function PresetManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { presets, custom } = usePresets();
  const [draft, setDraft] = useState<ExportPreset[]>([]);
  const [cur, setCur] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { if (open) { setDraft(structuredClone(presets)); setCur(0); setErr(""); } }, [open, presets]);
  const listRef = useRef<HTMLDivElement>(null);
  // 新增、複製後選中的是最後一組：左邊清單捲過去，才看得到正在編輯哪一組
  useEffect(() => { listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [cur, draft.length]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(presets);
  const p = draft[cur];
  const edit = (patch: Partial<ExportPreset>) => setDraft((d) => d.map((x, i) => (i === cur ? { ...x, ...patch } : x)));
  const nextN = () => { let n = draft.length + 1; while (draft.some((x) => x.id === `preset_${n}`)) n++; return n; };

  const save = async () => {
    setBusy(true); setErr("");
    try { await savePresets(draft); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} wide label="匯出預設集">
      <div className="mb-4 flex items-baseline gap-3">
        <h3 className="text-lg">匯出預設集</h3>
        <span className="text-xs text-mute">每組＝一個平台要的尺寸與檔案大小上限；圖庫匯出時勾選要用哪幾組</span>
      </div>
      <div className="flex min-h-[420px] gap-5">
        <div className="flex w-60 shrink-0 flex-col gap-2">
          <div ref={listRef} className="scroll-inset-sm max-h-[52vh] flex-1 space-y-1 overflow-y-auto pr-1">
            {draft.map((x, i) => (
              <button key={i} onClick={() => setCur(i)} aria-current={i === cur}
                className={`block w-full rounded-xl border px-3 py-2 text-left transition ${i === cur ? "border-acc bg-panel2" : "border-transparent hover:bg-panel2/70"}`}>
                <div className="truncate text-sm">{x.name || "（未命名）"}</div>
                <div className="truncate text-[11px] text-mute">{presetSummary(x)}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-sm" onClick={() => { setDraft((d) => [...d, blank(nextN())]); setCur(draft.length); }}>＋ 新增</button>
            <button className="btn btn-sm" disabled={!p} onClick={() => {
              const n = nextN();
              setDraft((d) => [...d, { ...structuredClone(p), id: `preset_${n}`, folder: `${p.folder}_${n}`, name: `${p.name}（複製）` }]);
              setCur(draft.length);
            }}>複製</button>
          </div>
          <button className="btn btn-sm text-bad hover:border-bad hover:text-bad" disabled={!p}
            onClick={() => { setDraft((d) => d.filter((_, i) => i !== cur)); setCur((c) => Math.max(0, c - 1)); }}>刪除這組</button>
        </div>

        {p ? (
          <div className="min-w-0 flex-1 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="label">名稱<input className="input mt-1" maxLength={40} value={p.name} onChange={(e) => edit({ name: e.target.value })} /></label>
              <label className="label">zip 裡的資料夾名稱（英數、_、-）
                <input className="input mt-1 font-mono" maxLength={40} value={p.folder}
                  onChange={(e) => edit({ folder: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} /></label>
            </div>

            <div>
              <span className="label">尺寸（寬 × 高，px；一組可以有好幾個尺寸）</span>
              <div className="flex flex-wrap gap-2">
                {p.sizes.map((s, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-xl bg-panel2 px-2 py-1">
                    <input className="input !w-20 !px-2 !py-1 text-center" type="number" min={8} max={2048} value={s.w}
                      onChange={(e) => edit({ sizes: p.sizes.map((x, j) => (j === i ? { ...x, w: +e.target.value } : x)) })} aria-label="寬" />
                    <span className="text-mute">×</span>
                    <input className="input !w-20 !px-2 !py-1 text-center" type="number" min={8} max={2048} value={s.h}
                      onChange={(e) => edit({ sizes: p.sizes.map((x, j) => (j === i ? { ...x, h: +e.target.value } : x)) })} aria-label="高" />
                    <button className="ml-1 text-mute hover:text-bad disabled:opacity-30" disabled={p.sizes.length <= 1} aria-label="移除這個尺寸"
                      onClick={() => edit({ sizes: p.sizes.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                ))}
                {p.sizes.length < 8 && <button className="btn btn-sm" onClick={() => edit({ sizes: [...p.sizes, { w: 128, h: 128 }] })}>＋ 尺寸</button>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label">縮放方式</span>
                <Seg value={p.mode} onChange={(mode) => edit({ mode })}
                  options={[["fit", "等比縮進框內"], ["canvas", "固定畫布，置中補透明"]]} />
                <p className="mt-1 text-[11px] text-mute">{p.mode === "fit" ? "輸出縮好的大小（正方形貼圖 → 邊長取寬高較小者）" : "輸出剛好是寬×高，例如 LINE 聊天室標籤 96×74"}</p>
              </div>
              <div>
                <span className="label">檔名</span>
                <Seg value={p.naming} onChange={(naming) => edit({ naming })}
                  options={[["keep", "保留原檔名"], ["index", "序號 01.png…"]]} />
                <p className="mt-1 text-[11px] text-mute">{p.naming === "index" ? "每個畫風依貼圖編號排成 01.png、02.png…（LINE 上架用）" : "01_happy_s6.png（加上畫風與版本標記）"}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="label">四周留白（px）
                <input className="input mt-1" type="number" min={0} max={256} value={p.margin} onChange={(e) => edit({ margin: Math.max(0, +e.target.value) })} /></label>
              <label className="label">檔案大小上限（KB，選填）
                <input className="input mt-1" type="number" min={1} max={20480} placeholder="不限" value={p.max_kb ?? ""}
                  onChange={(e) => edit({ max_kb: e.target.value === "" ? null : Math.max(1, +e.target.value) })} /></label>
              <div className="label">尺寸取偶數
                <label className="mt-2.5 flex items-center gap-2 text-sm text-text"><Check checked={p.even} onCheckedChange={(even) => edit({ even })} />寬高都調成偶數（LINE）</label>
              </div>
            </div>
            <p className="text-[11px] text-mute">超過大小上限時會先無損壓縮，還是太大就降成 256 色；都不行會在匯出結果裡提醒。</p>

            <label className="label">說明（選填，例如平台規範）
              <textarea className="input mt-1 h-16 resize-none" maxLength={200} value={p.note} onChange={(e) => edit({ note: e.target.value })} /></label>
          </div>
        ) : <p className="flex-1 py-10 text-center text-mute">沒有預設集，按「＋ 新增」建立一組</p>}
      </div>

      {err && <p className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
      <div className="mt-4 flex items-center gap-2 border-t border-line/60 pt-4">
        <button className="btn btn-sm" disabled={busy} onClick={() => setConfirmReset(true)} title={custom ? "" : "目前就是內建預設集"}>還原內建預設集</button>
        <span className="ml-auto" />
        <button className="btn" disabled={busy} onClick={onClose}>{dirty ? "取消" : "關閉"}</button>
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>儲存</button>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} label="還原內建預設集">
        <h3 className="mb-2 text-lg">還原成內建預設集？</h3>
        <p className="mb-5 text-sm text-mute">你新增或修改的預設集會被換回內建的那 13 組。原本的檔案會改名成 export_presets.json.bak 留在設定檔資料夾。</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirmReset(false)}>取消</button>
          <button className="btn btn-primary" onClick={async () => {
            setConfirmReset(false); setBusy(true);
            try { await resetPresets(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
          }}>還原</button>
        </div>
      </Modal>
    </Modal>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="mt-1 flex w-fit items-center rounded-full bg-panel2 p-0.5 text-xs" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 transition ${value === v ? "bg-panel text-text shadow-[var(--shadow-soft)]" : "text-mute hover:text-text"}`}>{label}</button>
      ))}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type DirInfo, type DirKey, type PathCheck, type SettingsInfo, type SettingsPlan, type SettingsValues } from "../api";
import { desktop } from "../desktop";
import { reloadStickers } from "../stickers";
import { Modal, Spinner } from "./ui";

const fmtSize = (b: number) => b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;
const LAYOUT_LABEL: Record<string, string> = { "4x2w": "4×2 寬版（每組 8 張）", "3x2": "3×2（每組 6 張）" };

/** Navbar 齒輪：設定對話框（資料夾位置、生成參數；儲存立即生效） */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="設定" title="設定" className="btn px-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      </button>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [dirs, setDirs] = useState<Record<DirKey, string>>({} as Record<DirKey, string>);
  const [vals, setVals] = useState<SettingsValues | null>(null);
  const [checks, setChecks] = useState<Partial<Record<DirKey, PathCheck>>>({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<SettingsPlan | null>(null);
  const [done, setDone] = useState("");

  const reset = (d: SettingsInfo) => {
    setInfo(d);
    setDirs(Object.fromEntries(d.dirs.map((x) => [x.key, x.value])) as Record<DirKey, string>);
    setVals(d.values);
    setChecks({});
  };
  useEffect(() => {
    if (!open) return;
    setErr(""); setDone(""); setPlan(null); setInfo(null);
    api.get<SettingsInfo>("/api/settings").then(reset).catch((e) => setErr((e as Error).message));
  }, [open]);

  const changedDirs = useMemo(() => info ? info.dirs.filter((x) => (dirs[x.key] ?? x.value).trim() !== x.value) : [], [info, dirs]);
  const changedVals = useMemo(() => {
    if (!info || !vals) return {};
    return Object.fromEntries((["max_parallel", "default_layout", "image_timeout_min", "text_timeout_min"] as const)
      .filter((k) => vals[k] !== info.values[k]).map((k) => [k, vals[k]]));
  }, [info, vals]);
  const dirty = changedDirs.length > 0 || Object.keys(changedVals).length > 0;
  const hasError = Object.values(checks).some((c) => c?.error);

  // 改路徑時（停 0.3 秒）檢查一次：能不能寫、有沒有和其他資料夾重疊
  const timers = useRef<Partial<Record<DirKey, number>>>({});
  const setDir = (key: DirKey, value: string) => {
    setDirs((d) => {
      const next = { ...d, [key]: value };
      clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => {
        const others = Object.fromEntries(Object.entries(next).filter(([k]) => k !== key));
        api.post<PathCheck>("/api/settings/check", { key, value, others })
          .then((c) => setChecks((x) => ({ ...x, [key]: c }))).catch(() => {});
      }, 300);
      return next;
    });
  };
  const pick = async (key: DirKey, current: string) => {
    try {
      // 桌面版用 Electron 的原生視窗；網頁版請伺服器跳 tkinter 視窗
      const path = desktop ? await desktop.pickFolder(current)
        : (await api.post<{ path: string | null }>("/api/settings/pick-folder", { path: current })).path;
      if (path) setDir(key, path);
    } catch (e) { setErr((e as Error).message); }
  };
  const openFolder = (path: string) => api.post("/api/settings/open-folder", { path }).catch((e) => setErr((e as Error).message));

  const changes = () => ({ ...Object.fromEntries(changedDirs.map((x) => [x.key, dirs[x.key].trim()])), ...changedVals });
  const save = async () => {
    setErr("");
    if (changedDirs.length) {
      try { setPlan(await api.post<SettingsPlan>("/api/settings/plan", { changes: changes() })); }
      catch (e) { setErr((e as Error).message); }
      return;
    }
    await commit(true, null);
  };
  const commit = async (move: boolean, conflict: "keep" | "overwrite" | null) => {
    setSaving(true); setErr("");
    try {
      const r = await api.put<SettingsInfo>("/api/settings", { changes: changes(), move, conflict });
      reset(r);
      setPlan(null);
      await reloadStickers();   // 設定檔資料夾換了，表情清單要重讀
      const moved = r.report?.moved.reduce((n, m) => n + m.moved, 0) ?? 0;
      const skipped = r.report?.moved.reduce((n, m) => n + m.skipped, 0) ?? 0;
      setDone(r.report?.moved.length ? `已儲存，搬了 ${moved} 個檔案${skipped ? `（${skipped} 個同名檔保留新位置的）` : ""}` : "已儲存，立即生效");
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={() => !saving && onClose()} label="設定">
      <div className="space-y-5">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg">設定</h3>
          {info && <span className="min-w-0 truncate text-[11px] text-mute" title={info.settings_file}>存在 {info.settings_file}</span>}
        </div>
        {!info && !err && <div className="flex items-center gap-2 py-8 text-mute"><Spinner />讀取中…</div>}
        {info && vals && <>
          <Group title="資料夾" note="一律填完整路徑（例如 D:\EMochiData\logs），或按「選擇…」挑資料夾。儲存時可以選擇把現有檔案搬過去。">
            {info.dirs.map((x) => (
              <DirRow key={x.key} d={x} value={dirs[x.key] ?? x.value} check={checks[x.key]}
                onChange={(v) => setDir(x.key, v)} onPick={() => pick(x.key, checks[x.key]?.path ?? x.path)}
                onOpen={() => openFolder(checks[x.key]?.path ?? x.path)} onReset={() => setDir(x.key, x.default)} />
            ))}
          </Group>

          <Group title="生成">
            <Field label="同時生圖組數" hint="調低比較不容易撞到 Codex 額度上限；改了之後，排隊中的組別也照新的上限">
              <Seg options={[1, 2, 3].map((n) => [n, `${n} 組`])} value={vals.max_parallel} onChange={(v) => setVals({ ...vals, max_parallel: v })} />
            </Field>
            <Field label="預設網格版型" hint="Gen「選擇貼圖」步驟一開始選哪一個">
              <Seg options={info.layouts.map((l) => [l, LAYOUT_LABEL[l] ?? l])} value={vals.default_layout} onChange={(v) => setVals({ ...vals, default_layout: v as SettingsValues["default_layout"] })} />
            </Field>
            <Field label="生圖逾時" hint="單組超過就停掉、標成逾時">
              <Num value={vals.image_timeout_min} lim={info.limits.image_timeout_min} onChange={(v) => setVals({ ...vals, image_timeout_min: v })} />
            </Field>
            <Field label="文字任務逾時" hint="擴寫、看圖寫特徵、分析畫風">
              <Num value={vals.text_timeout_min} lim={info.limits.text_timeout_min} onChange={(v) => setVals({ ...vals, text_timeout_min: v })} />
            </Field>
          </Group>

          <Group title="Codex">
            <Field label="執行參數" hint="生圖時實際執行的指令（不含參考圖與 prompt）；改錯會讓 Codex 沒辦法寫入，需要時直接改設定檔">
              <code className="block rounded-lg bg-panel2 px-2.5 py-1.5 font-mono text-xs">{info.codex_command.join(" ")}</code>
              <p className="mt-1 text-[11px] text-mute">--enable prefer_mxc：Windows 能用 MXC 沙盒就用，不能用時自動退回舊模式；只影響 EMochi 的呼叫，不改 Codex 的設定檔。
                {info.codex_command.includes("--add-dir") && " --add-dir：專案輸出資料夾在專案外，加開讓 Codex 能寫入。"}</p>
            </Field>
          </Group>
        </>}

        {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
        {done && !dirty && <p className="rounded-lg bg-ok/15 px-3 py-2 text-sm text-ok">{done}</p>}
        {info?.busy && changedDirs.length > 0 && <p className="rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">{info.busy}，等它結束才能改資料夾位置。</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={saving}>{dirty ? "取消" : "關閉"}</button>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving || hasError || (!!info?.busy && changedDirs.length > 0)}>
            {saving ? <><Spinner className="size-3.5 border-on-acc border-t-transparent" />儲存中</> : "儲存"}
          </button>
        </div>
      </div>
      <MoveConfirm plan={plan} saving={saving} onCancel={() => setPlan(null)} onConfirm={commit} />
    </Modal>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div><h4 className="text-sm">{title}</h4>{note && <p className="text-[11px] text-mute">{note}</p>}</div>
      {children}
    </section>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr]">
      <div><div className="text-sm">{label}</div>{hint && <div className="text-[11px] leading-snug text-mute">{hint}</div>}</div>
      <div>{children}</div>
    </div>
  );
}
function Seg<T extends string | number>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={String(v)} onClick={() => onChange(v)} aria-pressed={value === v}
          className={`rounded-full border-2 px-3 py-0.5 text-xs transition ${value === v ? "border-pink bg-pink-soft" : "border-line text-mute hover:border-acc"}`}>{label}</button>
      ))}
    </div>
  );
}
function Num({ value, lim, onChange }: { value: number; lim: [number, number]; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="number" className="input w-24" min={lim[0]} max={lim[1]} value={value}
        onChange={(e) => onChange(Math.min(lim[1], Math.max(lim[0], Number(e.target.value) || lim[0])))} />
      <span className="text-xs text-mute">分鐘（{lim[0]}～{lim[1]}）</span>
    </div>
  );
}

function DirRow({ d, value, check, onChange, onPick, onOpen, onReset }: {
  d: DirInfo; value: string; check?: PathCheck; onChange: (v: string) => void; onPick: () => void; onOpen: () => void; onReset: () => void;
}) {
  const changed = value.trim() !== d.value;
  const stat = changed && check ? check : d;
  return (
    <div className="rounded-2xl bg-panel2 p-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm">{d.label}</span>
        <span className="min-w-0 truncate text-[11px] text-mute">{d.desc}</span>
        {changed && <span className="ml-auto shrink-0 rounded-full bg-gold/20 px-2 text-[11px] text-gold-deep">已修改</span>}
      </div>
      <div className="flex gap-1.5">
        <input className="input bg-panel font-mono text-xs" value={value} spellCheck={false} placeholder="完整路徑" onChange={(e) => onChange(e.target.value)} aria-label={d.label} />
        <button className="btn btn-sm shrink-0" onClick={onPick} title="跳出資料夾選擇視窗（在這台電腦上）">選擇…</button>
        <button className="btn btn-sm shrink-0" onClick={onOpen} title="在檔案總管開啟">開啟</button>
        {value.trim() !== d.default && <button className="btn btn-sm shrink-0" onClick={onReset} title={`恢復預設（${d.default}）`}>預設</button>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-mute">
        <span className="min-w-0 truncate" title={stat.path}>{stat.path}</span>
        <span className="shrink-0">{stat.exists ? `${stat.files} 個檔案・${fmtSize(stat.size)}` : "資料夾還不存在"}</span>
      </div>
      {changed && check?.error && <p className="mt-1 text-xs text-bad">{check.error}</p>}
      {changed && !check?.error && check?.warn && <p className="mt-1 text-xs text-warn">{check.warn}</p>}
    </div>
  );
}

function MoveConfirm({ plan, saving, onCancel, onConfirm }: {
  plan: SettingsPlan | null; saving: boolean; onCancel: () => void; onConfirm: (move: boolean, conflict: "keep" | "overwrite" | null) => void;
}) {
  const [move, setMove] = useState(true);
  const [conflict, setConflict] = useState<"keep" | "overwrite">("keep");
  useEffect(() => { if (plan) { setMove(true); setConflict("keep"); } }, [plan]);
  const conflicts = plan?.dirs.reduce((n, d) => n + d.conflict_count, 0) ?? 0;
  const files = plan?.dirs.reduce((n, d) => n + d.files, 0) ?? 0;
  return (
    <Modal open={!!plan} onClose={() => !saving && onCancel()} label="確認更改資料夾">
      {plan && <div className="space-y-3">
        <h3 className="text-lg">更改資料夾位置</h3>
        <ul className="space-y-2">
          {plan.dirs.map((d) => (
            <li key={d.key} className="rounded-xl bg-panel2 px-3 py-2 text-xs">
              <div className="mb-0.5 text-sm">{d.label}<span className="ml-2 text-xs text-mute">{d.files} 個檔案・{fmtSize(d.size)}</span></div>
              <div className="truncate font-mono text-mute" title={d.from}>從 {d.from}</div>
              <div className="truncate font-mono" title={d.to}>到 {d.to}</div>
            </li>
          ))}
        </ul>
        {plan.errors.length > 0 && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{plan.errors.join("；")}</p>}
        {plan.busy && <p className="rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">{plan.busy}，等它結束再改。</p>}
        <fieldset className="space-y-1.5 text-sm">
          <Radio checked={move} onChange={() => setMove(true)} label={`搬過去（${files} 個檔案）`} hint="專案裡記的參考圖、log 路徑也會一起改成新位置" />
          <Radio checked={!move} onChange={() => setMove(false)} label="只改路徑" hint="舊檔案留在原地；新位置是空的話，表情會退回基礎 32 種、用量統計會從零開始" />
        </fieldset>
        {move && conflicts > 0 && (
          <div className="rounded-xl bg-warn/10 p-3 text-sm">
            <p className="mb-1.5 text-warn">新位置已經有 {conflicts} 個同名檔案：</p>
            <ul className="mb-2 max-h-24 overflow-auto font-mono text-[11px] text-mute">
              {plan.dirs.flatMap((d) => d.conflicts.map((c) => <li key={d.key + c}>{d.label}／{c}</li>))}
              {plan.dirs.some((d) => d.conflict_count > d.conflicts.length) && <li>…</li>}
            </ul>
            <Radio checked={conflict === "keep"} onChange={() => setConflict("keep")} label="保留新位置的（舊位置那份留在原地）" />
            <Radio checked={conflict === "overwrite"} onChange={() => setConflict("overwrite")} label="用舊位置的覆蓋" />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onCancel} disabled={saving}>返回</button>
          <button className="btn btn-primary" disabled={saving || plan.errors.length > 0 || !!plan.busy}
            onClick={() => onConfirm(move, move && conflicts ? conflict : null)}>
            {saving ? <><Spinner className="size-3.5 border-on-acc border-t-transparent" />處理中</> : "確定"}
          </button>
        </div>
      </div>}
    </Modal>
  );
}

function Radio({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="radio" className="chk mt-0.5" checked={checked} onChange={onChange} />
      <span>{label}{hint && <span className="block text-[11px] text-mute">{hint}</span>}</span>
    </label>
  );
}

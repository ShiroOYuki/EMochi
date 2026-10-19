import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { api, type CodexRun, type CodexRunResult, type CodexStatus, type CodexTally, type RateWindow } from "../api";
import { Modal, SPRING, Spinner } from "./ui";
import { copyText } from "./manage";

const POLL_MS = 5_000;   // 對話框開著時：執行中的工作、用量要跟著動
const fmtTok = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
const fmtFull = (n: number) => n.toLocaleString("en-US");
const fmtSec = (s: number | null) => s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} 秒`;
const fmtTime = (sec: number) => new Date(sec * 1000).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const RESULT: Record<CodexRunResult, [string, string]> = {
  ok: ["完成", "text-ok"], failed: ["失敗", "text-bad"], timeout: ["逾時", "text-bad"], running: ["執行中", "text-acc"], unknown: ["中斷", "text-warn"],
};

/** Codex 詳細狀態：連線（CLI、登入）、額度、執行中、近 7 天這個專案的 token 用量、最近的呼叫 */
export default function CodexStatusDialog({ open, onClose, onReconnected }: { open: boolean; onClose: () => void; onReconnected?: () => void }) {
  const [d, setD] = useState<CodexStatus | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const alive = useRef(true);
  const load = useCallback(async (force = false) => {
    try { const x = await api.get<CodexStatus>(`/api/codex-status${force ? "?refresh=1" : ""}`); if (alive.current) { setD(x); setErr(""); } }
    catch (e) { if (alive.current) setErr((e as Error).message); }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!open) return;
    load();
    const t = setInterval(() => load(), POLL_MS);
    return () => { alive.current = false; clearInterval(t); };
  }, [open, load]);

  /** 重新連線：重查 CLI、登入狀態，並跳過快取重讀額度 */
  const reconnect = async () => {
    setBusy(true); setNote("");
    await Promise.all([load(true), new Promise((r) => setTimeout(r, 500))]);
    onReconnected?.();
    if (alive.current) setBusy(false);
  };
  const login = async () => {
    try { const r = await api.post<{ message: string }>("/api/codex-login"); setNote(r.message); load(); }
    catch (e) { setNote((e as Error).message); }
  };

  const conn = !d ? null : !d.cli.found ? ["找不到 Codex CLI", "bg-bad"] : !d.login.ok ? ["未登入", "bg-warn"] : ["已連線", "bg-ok"];

  return (
    <Modal open={open} onClose={onClose} wide label="Codex 狀態">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg">Codex 狀態</h3>
          {conn && <span className="flex items-center gap-1.5 rounded-full bg-panel2 px-2.5 py-0.5 text-xs">
            <span className={`size-2 rounded-full ${conn[1]}`} />{conn[0]}</span>}
          {d?.checked_at && <span className="text-xs text-mute">檢查時間 {fmtTime(d.checked_at)}</span>}
          <button className="btn btn-sm ml-auto" onClick={reconnect} disabled={busy}>
            {busy ? <><Spinner className="size-3" />連線中…</> : "重新連線"}</button>
        </div>
        {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">讀不到狀態：{err}</p>}
        {!d && !err && <div className="flex items-center gap-2 py-10 text-mute"><Spinner />讀取中…</div>}
        {d && <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card title="連線">
              <Row k="CLI" v={d.cli.found ? (d.cli.version ?? "版本不明") : "找不到"} tone={d.cli.found ? "" : "text-bad"} tip={d.cli.path ?? d.cli.error} />
              <Row k="登入" v={d.login.ok ? d.login.text : (d.login.text || "未登入")} tone={d.login.ok ? "" : "text-warn"} />
              <Row k="Session 記錄" v={d.sessions_found ? "有" : "找不到"} tip={d.sessions_dir} tone={d.sessions_found ? "" : "text-warn"} />
              {d.cli.found && !d.login.ok && (
                <button className="btn btn-sm mt-2" onClick={login} disabled={d.login.pending}>{d.login.pending ? "等待瀏覽器登入…" : "重新登入"}</button>
              )}
              {note && <p className="mt-2 text-[11px] text-mute">{note}</p>}
            </Card>
            <Card title={`額度${d.rate.plan_type ? `（${d.rate.plan_type}）` : ""}`}>
              {d.rate.available ? <>
                {d.rate.primary && <Meter label="5 小時" w={d.rate.primary} />}
                {d.rate.secondary && <Meter label="每週" w={d.rate.secondary} />}
                {d.rate.updated && <p className="mt-1 text-[11px] text-mute">資料時間 {fmtTime(d.rate.updated)}（Codex 跑過才會更新）</p>}
              </> : <p className="text-xs text-mute">{d.rate.message || "讀不到額度"}</p>}
            </Card>
            <Card title={`執行中 ${d.running.length}`}>
              {d.running.length ? d.running.map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                  <Spinner className="size-3 border-acc border-t-transparent" />
                  <span className="min-w-0 flex-1 truncate">{r.scope_label}・{r.kind} {r.name}</span>
                  <span className="tabular-nums text-mute">{fmtSec(r.seconds)}</span>
                </div>
              )) : <p className="text-xs text-mute">目前沒有在跑的 Codex</p>}
            </Card>
          </div>

          <Usage d={d.usage} />
        </>}
      </div>
    </Modal>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl bg-panel2 p-4"><h4 className="mb-2 text-sm">{title}</h4>{children}</section>;
}
function Row({ k, v, tone = "", tip }: { k: string; v: string; tone?: string; tip?: string | null }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-xs" title={tip ?? undefined}>
      <span className="w-20 shrink-0 text-mute">{k}</span><span className={`min-w-0 truncate ${tone}`}>{v}</span>
    </div>
  );
}
function Meter({ label, w }: { label: string; w: RateWindow }) {
  const p = Math.min(100, Math.max(0, w.used_percent));
  const tone = p >= 85 ? "bg-bad" : p >= 60 ? "bg-warn" : "bg-ok";
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="text-mute">{label}</span><span className="tabular-nums">{p.toFixed(1)}%</span>
        <span className="ml-auto text-[11px] text-mute">{w.resets_at ? (w.expired ? `已在 ${fmtTime(w.resets_at)} 重置` : `${fmtTime(w.resets_at)} 重置`) : ""}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel" role="meter" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${label}額度已使用`}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function Usage({ d }: { d: CodexStatus["usage"] }) {
  const max = Math.max(1, ...d.daily.map((x) => x.tokens));
  return (
    <section className="space-y-4 rounded-2xl bg-panel2 p-4">
      <h4 className="text-sm">近 {d.days} 天這個專案的用量 <span className="text-[11px] text-mute">（從 logs/ 統計；在別處用 Codex 不算）</span></h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="總 token" value={fmtTok(d.total_tokens)} tip={fmtFull(d.total_tokens)} />
        <Stat label="呼叫次數" value={String(d.runs)} />
        <Stat label="每張網格平均" value={d.avg_grid_tokens ? fmtTok(d.avg_grid_tokens) : "—"} tip={d.avg_grid_tokens ? `${fmtFull(d.avg_grid_tokens)}（批次生圖＋風格預覽）` : undefined} />
        <Stat label="失敗／逾時" value={String(d.failed)} />
      </div>

      {/* 每日 token：單一系列長條圖，滑過看當天明細 */}
      <div>
        <div className="flex h-40 items-end gap-2 border-b border-line pb-px">
          {d.daily.map((x) => {
            const h = x.tokens ? Math.max(4, (x.tokens / max) * 100) : 0;
            const tip = [`${x.date}：${fmtFull(x.tokens)} tokens、${x.runs} 次`,
              ...Object.entries(x.by_kind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmtFull(v)}`)].join("\n");
            return (
              <div key={x.date} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={tip}>
                {x.tokens > 0 && <span className="mb-1 text-[11px] tabular-nums text-mute group-hover:text-text">{fmtTok(x.tokens)}</span>}
                <div className="w-full max-w-12 rounded-t-[4px] bg-acc transition group-hover:brightness-110" style={{ height: `${h}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-2">
          {d.daily.map((x) => {
            const dt = new Date(`${x.date}T00:00:00`);
            return <span key={x.date} className="flex-1 text-center text-[11px] text-mute">{dt.getMonth() + 1}/{dt.getDate()}（{WEEK[dt.getDay()]}）</span>;
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Bars title="依用途" items={d.by_kind} total={d.total_tokens} />
        <Bars title="依專案／範圍" items={d.by_scope} total={d.total_tokens} />
      </div>

      <RecentRuns runs={d.recent} days={d.days} />
    </section>
  );
}

function Stat({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className="rounded-xl bg-panel px-3 py-2" title={tip}>
      <div className="text-[11px] text-mute">{label}</div><div className="text-xl tabular-nums">{value}</div>
    </div>
  );
}
const BAR_ROW = 30;      // 每一列固定高度（文字 + 進度條 + 間距），最多顯示 BAR_ROWS 列，多的捲動
const BAR_ROWS = 8;

function Bars({ title, items, total }: { title: string; items: CodexTally[]; total: number }) {
  const max = Math.max(1, ...items.map((x) => x.tokens));
  const scroll = items.length > BAR_ROWS;
  return (
    <div>
      <h5 className="mb-1.5 text-xs text-mute">{title}{scroll && <span className="ml-1 text-[11px]">（共 {items.length} 項，捲動看更多）</span>}</h5>
      {items.length ? <div className={scroll ? "scroll-inset-sm overflow-y-auto overscroll-contain pr-2" : ""} style={scroll ? { maxHeight: BAR_ROW * BAR_ROWS } : undefined}>
      {items.map((x) => (
        <div key={x.key} className="flex flex-col justify-center" style={{ height: BAR_ROW }} title={`${x.label}：${fmtFull(x.tokens)} tokens、${x.runs} 次（${total ? Math.round((x.tokens / total) * 100) : 0}%）`}>
          <div className="mb-0.5 flex items-baseline gap-2 text-xs">
            <span className="min-w-0 truncate">{x.label}</span><span className="text-[11px] text-mute">{x.runs} 次</span>
            <span className="ml-auto tabular-nums">{fmtTok(x.tokens)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-panel"><div className="h-full rounded-full bg-acc" style={{ width: `${(x.tokens / max) * 100}%` }} /></div>
        </div>
      ))}
      </div> : <p className="text-xs text-mute">沒有資料</p>}
    </div>
  );
}

/** 最近的呼叫：滑到哪一列，提示框就立刻跟到那一列（不等 0.4 秒、列與列之間用彈簧滑過去，而不是消失再出現）；
 *  提示只顯示 log 路徑，點一下該列就複製路徑 */
function RecentRuns({ runs, days }: { runs: CodexRun[]; days: number }) {
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [tip, setTip] = useState<{ i: number; x: number; y: number; fresh: boolean } | null>(null);
  const hideT = useRef(0);
  const [copied, setCopied] = useState<number | null>(null);
  const copiedT = useRef(0);
  const copy = (i: number) => {
    copyText(runs[i].log);
    setCopied(i);
    clearTimeout(copiedT.current);
    copiedT.current = window.setTimeout(() => setCopied(null), 1200);
  };
  const place = (e: RPointerEvent<HTMLTableRowElement>, i: number) => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return;
    const row = e.currentTarget.getBoundingClientRect();
    clearTimeout(hideT.current);
    // x 跟著游標（限制在表格內），y 貼在這一列上緣
    const x = Math.min(Math.max(e.clientX - b.left, 120), b.width - 120);
    setTip((t) => ({ i, x, y: row.top - b.top, fresh: !t }));
  };
  const leave = () => { hideT.current = window.setTimeout(() => setTip(null), 80); };
  useEffect(() => () => { clearTimeout(hideT.current); clearTimeout(copiedT.current); }, []);
  const r = tip ? runs[tip.i] : null;
  const move = reduce || tip?.fresh ? { duration: 0 } : SPRING;

  return (
    <div>
      <h5 className="mb-1.5 text-xs text-mute">最近的呼叫 <span className="text-[11px]">（近 {days} 天內最新 {runs.length} 次）</span></h5>
      {runs.length ? (
        <div ref={box} className="relative" onPointerLeave={leave}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-mute"><tr>
                <th className="py-1 pr-3 font-normal">時間</th><th className="pr-3 font-normal">專案／範圍</th><th className="pr-3 font-normal">用途</th>
                <th className="pr-3 text-right font-normal">tokens</th><th className="pr-3 text-right font-normal">耗時</th><th className="font-normal">結果</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {runs.map((x, i) => (
                  <tr key={x.log} onPointerEnter={(e) => place(e, i)} onPointerMove={(e) => place(e, i)} onClick={() => copy(i)}
                    tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copy(i); } }}
                    aria-label={`複製 log 路徑 ${x.log}`}
                    className={`cursor-pointer outline-none transition-colors focus-visible:bg-panel ${tip?.i === i ? "bg-panel" : ""}`}>
                    <td className="py-1 pr-3 whitespace-nowrap tabular-nums text-mute">{x.time.slice(5, 16)}</td>
                    <td className="max-w-48 truncate pr-3">{x.scope_label}</td>
                    <td className="pr-3 whitespace-nowrap">{x.kind}<span className="ml-1 text-mute">{/^g\d+$/.test(x.name) ? `第 ${x.name.slice(1)} 組` : ""}</span></td>
                    <td className="pr-3 text-right tabular-nums">{x.tokens != null ? fmtFull(x.tokens) : "—"}</td>
                    <td className="pr-3 text-right tabular-nums text-mute">{fmtSec(x.seconds)}</td>
                    <td className={RESULT[x.result][1]}>{RESULT[x.result][0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 放在捲動容器外面，第一列上方的提示才不會被裁掉 */}
          <motion.div aria-hidden className="pointer-events-none absolute top-0 left-0 z-10 w-max"
            initial={false}
            animate={tip ? { x: tip.x, y: tip.y, opacity: 1 } : { opacity: 0 }}
            transition={{ x: move, y: move, opacity: { duration: reduce ? 0 : 0.12 } }}>
            {r && (
              <div className="-translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-xl bg-text px-2.5 py-1.5 text-xs whitespace-nowrap text-panel shadow-[0_8px_20px_-8px_rgb(0_0_0/0.45)]">
                {copied === tip!.i ? "✓ 已複製" : r.log}
              </div>
            )}
          </motion.div>
        </div>
      ) : <p className="text-xs text-mute">近 {days} 天沒有呼叫記錄</p>}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CodexUsage as Usage, type RateWindow } from "../api";
import CodexStatusDialog from "./CodexStatus";

const POLL_MS = 30_000;
type Level = "ok" | "warn" | "bad" | "off";

/** 用得最兇的那個窗口決定燈號：< 60% 綠、< 85% 黃、其餘紅；讀不到資料是灰 */
const levelOf = (u: Usage | null): Level => {
  if (!u?.available) return "off";
  const max = Math.max(u.primary?.used_percent ?? 0, u.secondary?.used_percent ?? 0);
  return max >= 85 ? "bad" : max >= 60 ? "warn" : "ok";
};
const LAMP: Record<Level, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", off: "bg-mute/50" };
const LEVEL_TEXT: Record<Level, string> = {
  ok: "額度充足",
  warn: "額度偏高",
  bad: "額度快用完",
  off: "讀不到額度",
};

const windowName = (w: RateWindow, fallback: string) => {
  const m = w.window_minutes;
  if (!m) return fallback;
  if (m >= 10080 - 60 && m <= 10080 + 60) return "週";
  if (m % 1440 === 0) return `${m / 1440}天`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${m}分`;
};
const fmtTime = (sec: number) =>
  new Date(sec * 1000).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const pct = (w: RateWindow) => `${Math.round(w.used_percent)}%`;

/** Navbar 右側：Codex 額度百分比＋狀態燈；資料來自 Codex 的 session 記錄，跑過 Codex 才會更新 */
export default function CodexUsage({ className = "" }: { className?: string }) {
  const [u, setU] = useState<Usage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const alive = useRef(true);
  const load = useCallback(
    (force = false) =>
      api
        .get<Usage>(`/api/codex-usage${force ? "?refresh=1" : ""}`)
        .then((d) => alive.current && setU(d))
        .catch(() => alive.current && setU(null)),
    [],
  );
  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(() => load(), POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive.current = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);
  /** 刷新按鈕：跳過後端快取重新讀；至少轉半秒，讓人看得出有動作 */
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([load(true), new Promise((r) => setTimeout(r, 500))]);
    if (alive.current) setRefreshing(false);
  };

  const level = levelOf(u);
  const wins = u?.available
    ? ((
        [
          [u.primary, "5h"],
          [u.secondary, "週"],
        ] as const
      ).filter(([w]) => w) as [RateWindow, string][])
    : [];
  const title = !u
    ? "讀不到 Codex 額度（伺服器沒回應）"
    : !u.available
      ? u.message || "讀不到 Codex 額度"
      : [
          `Codex 額度（已使用）・${LEVEL_TEXT[level]}`,
          ...wins.map(([w, f]) =>
            w.expired
              ? `${windowName(w, f)}：已在 ${fmtTime(w.resets_at!)} 重置（0%，下次跑 Codex 會更新）`
              : `${windowName(w, f)}：${w.used_percent.toFixed(1)}%${w.resets_at ? `，${fmtTime(w.resets_at)} 重置` : ""}`,
          ),
          u.updated ? `資料時間：${fmtTime(u.updated)}（Codex 跑過才會更新）` : "",
        ]
          .filter(Boolean)
          .join("\n");

  return (
    <div
      data-tour="codex"
      className={`flex items-center gap-1 rounded-full bg-panel2 py-1 pr-1.5 pl-1 text-sm ${className}`}
    >
      {/* 點一下打開詳細狀態（連線、額度、近 7 天用量） */}
      <button
        onClick={() => setOpen(true)}
        title={`${title}\n\n點一下看詳細狀態`}
        aria-label={`${title}。點一下看詳細狀態`}
        className="flex items-center gap-2 rounded-full px-2 py-0.5 transition hover:bg-panel"
      >
        <span className="relative flex size-2.5" aria-hidden="true">
          {level === "bad" && (
            <span
              className={`absolute inline-flex size-full animate-ping rounded-full opacity-70 ${LAMP[level]}`}
            />
          )}
          <span className={`relative inline-flex size-2.5 rounded-full ${LAMP[level]}`} />
        </span>
        <span className="text-mute">Codex</span>
        {wins.length ? (
          wins.map(([w, f]) => (
            <span key={f} className="tabular-nums">
              <span className="text-xs text-mute">{windowName(w, f)} </span>
              {pct(w)}
            </span>
          ))
        ) : (
          <span className="text-mute">—</span>
        )}
      </button>
      <button
        onClick={refresh}
        disabled={refreshing}
        aria-label="重新讀取 Codex 額度"
        title="重新讀取 Codex 額度"
        className="flex size-6 items-center justify-center rounded-full text-mute transition hover:bg-panel hover:text-acc disabled:cursor-wait disabled:hover:bg-transparent"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={refreshing ? "animate-spin" : ""}
          aria-hidden="true"
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </svg>
      </button>
      <CodexStatusDialog open={open} onClose={() => setOpen(false)} onReconnected={() => load(true)} />
    </div>
  );
}

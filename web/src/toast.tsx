/** 站內通知（toast）：右下角疊起來的小卡片，幾秒後自動消失、滑鼠移上去時暫停倒數。
 *  任何地方都能呼叫 toast.ok／toast.info／toast.error（不需要 hook）；<Toaster /> 在 App 掛一次。
 *  用在：生圖完成／失敗（視窗在前景時；不在前景走桌面通知，notify.ts）、API 錯誤、匯出完成、有新版 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SPRING } from "./components/ui/motion";
import { ApiError } from "./api/client";

export type ToastKind = "ok" | "info" | "error";
export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  /** 卡片上的按鈕（例如「開啟專案」） */
  action?: { label: string; run: () => void };
  /** 點整張卡片做的事（沒給就不能點） */
  onClick?: () => void;
};
type Input = Omit<Toast, "id" | "kind">;

const MAX = 4; // 同時最多幾張，超過就把最舊的擠掉
const DURATION: Record<ToastKind, number> = { ok: 5000, info: 6000, error: 8000 };

let list: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function push(kind: ToastKind, t: Input | string): number {
  const item: Toast = { id: nextId++, kind, ...(typeof t === "string" ? { title: t } : t) };
  // 同樣的訊息還在畫面上就不重複疊（輪詢失敗、連點按鈕）
  const dup = list.find((x) => x.kind === kind && x.title === item.title && x.body === item.body);
  if (dup) return dup.id;
  list = [...list, item].slice(-MAX);
  emit();
  return item.id;
}

export function dismiss(id: number) {
  list = list.filter((x) => x.id !== id);
  emit();
}

export const toast = {
  ok: (t: Input | string) => push("ok", t),
  info: (t: Input | string) => push("info", t),
  error: (t: Input | string) => push("error", t),
};

/** API／程式錯誤的 toast（message 已經是後端給的說明） */
export const toastError = (e: unknown, title = "操作失敗") =>
  toast.error({ title, body: e instanceof Error ? e.message : String(e) });

const COLORS: Record<ToastKind, string> = { ok: "bg-ok", info: "bg-acc", error: "bg-bad" };

function Item({ t }: { t: Toast }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(DURATION[t.kind]);
  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const timer = window.setTimeout(() => dismiss(t.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - start;
    };
  }, [paused, t.id]);
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: 0.15 } }}
      transition={SPRING}
      role={t.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={
        t.onClick
          ? () => {
              t.onClick!();
              dismiss(t.id);
            }
          : undefined
      }
      className={`pointer-events-auto relative flex w-80 gap-3 overflow-hidden rounded-xl border border-line bg-panel py-3 pl-4 pr-3 text-sm shadow-soft ${t.onClick ? "cursor-pointer hover:bg-panel2" : ""}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${COLORS[t.kind]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={t.kind === "error" ? "text-bad" : ""}>{t.title}</p>
        {t.body && (
          <p className="mt-0.5 line-clamp-4 whitespace-pre-line break-words text-xs text-mute">{t.body}</p>
        )}
        {t.action && (
          <button
            className="btn btn-sm mt-2"
            onClick={(e) => {
              e.stopPropagation();
              t.action!.run();
              dismiss(t.id);
            }}
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button
        className="-mr-1 -mt-1 h-6 w-6 shrink-0 rounded-full text-mute hover:bg-panel2 hover:text-text"
        aria-label="關閉通知"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(t.id);
        }}
      >
        ×
      </button>
    </motion.div>
  );
}

/** App 掛一次：右下角的 toast 疊 */
export function Toaster() {
  const items = useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => list,
  );
  return (
    <div className="no-drag pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <Item key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** 沒有被元件接住的 API 錯誤（例如按鈕裡直接 await、沒寫 try）也跳 toast，不要默默失敗 */
export function useApiErrorToasts() {
  useEffect(() => {
    const onReject = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof ApiError) {
        toastError(e.reason);
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onReject);
    return () => window.removeEventListener("unhandledrejection", onReject);
  }, []);
}

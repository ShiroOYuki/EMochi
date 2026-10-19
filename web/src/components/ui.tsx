import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import type { GroupStatus, ProjectStatus } from "../api";
import { STATUS_TEXT } from "../api";
import { useReducedMotion } from "motion/react";
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from "@/components/animate-ui/primitives/radix/dialog";
import { cn } from "@/lib/utils";
import { Checkbox, CheckboxIndicator } from "@/components/animate-ui/primitives/radix/checkbox";
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/animate-ui/primitives/radix/tooltip";

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-mute border-t-transparent ${className}`} />;
}

const tone: Record<string, string> = {
  done: "bg-ok/20 text-ok", preview_ready: "bg-gold/20 text-gold-deep", review: "bg-warn/20 text-warn",
  failed: "bg-bad/20 text-bad", draft: "bg-panel2 text-mute", pending: "bg-panel2 text-mute",
};

export function StatusBadge({ status }: { status: ProjectStatus | GroupStatus }) {
  const text = (STATUS_TEXT as Record<string, string>)[status] ?? { pending: "等待中", running: "生成中", failed: "失敗" }[status as string] ?? status;
  const busy = ["expanding", "previewing", "generating", "processing", "running"].includes(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tone[status] ?? "bg-acc/20 text-acc"}`}>
      {busy && <Spinner className="size-3 border-acc border-t-transparent" />}{text}
    </span>
  );
}

/** 從 "YYYY-MM-DD HH:MM:SS" 開始經過的時間 */
export function Elapsed({ since }: { since?: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(since.replace(" ", "T")).getTime()) / 1000));
  return <span className="tabular-nums text-mute">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

/** 全站共用的彈簧：快、幾乎不回彈（使用者要俐落；Animate UI 預設是 stiffness 150 / damping 25，偏慢） */
export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;

/** 彈窗：Animate UI 的 Radix Dialog（焦點鎖定、Esc／點外面關閉、開關動畫）。
 *  介面跟舊版一樣：open / onClose / wide；label 給螢幕閱讀器用（畫面上不顯示） */
export function Modal({ open, onClose, children, wide, label = "對話框" }: {
  open: boolean; onClose: () => void; children: ReactNode; wide?: boolean; label?: string;
}) {
  const reduce = useReducedMotion();
  // 關閉時呼叫端通常會把內容清掉（例如 target 變 null）；留住最後一次的內容，收起動畫期間框才不會先變空白
  const last = useRef<ReactNode>(children);
  if (open) last.current = children;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-[#1d1b2e]/55 backdrop-blur-[2px]" transition={reduce ? { duration: 0 } : undefined} />
        <DialogContent aria-describedby={undefined} from="top" transition={reduce ? { duration: 0 } : SPRING}
          // 打開時焦點放在框本身（仍鎖在框內），不要自動跳到第一顆按鈕上冒出焦點框；框裡有 autoFocus 的就交給它
          onOpenAutoFocus={(e) => { e.preventDefault(); const el = e.currentTarget as HTMLElement; if (!el.contains(document.activeElement)) el.focus(); }}
          className={cn("fixed top-1/2 left-1/2 z-50 max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[26px] bg-panel p-6 shadow-2xl outline-none",
            wide ? "w-[min(1200px,96vw)]" : "w-[min(780px,96vw)]")}>
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {open ? children : last.current}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

/** 勾選框：Animate UI 的 Radix Checkbox（勾勾用畫線方式出現），勾選後是耳內粉。
 *  放在 <label> 裡時，點文字也會切換（button 是可被 label 啟動的元素） */
export function Check({ checked, onCheckedChange, className, label }: {
  checked: boolean; onCheckedChange: (v: boolean) => void; className?: string; label?: string;
}) {
  return (
    <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} aria-label={label}
      className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border-2 border-line bg-panel text-white outline-none transition-colors focus-visible:ring-3 focus-visible:ring-acc/40 data-[state=checked]:border-pink data-[state=checked]:bg-pink", className)}>
      <CheckboxIndicator className="size-3" />
    </Checkbox>
  );
}

/** 全站的 title 提示改成動畫 Tooltip：滑過（或用 Tab 聚焦）任何有 title 的元素，0.4 秒後浮出。
 *  不用一個一個改呼叫端：第一次碰到時把 title 搬到 data-tip（避免瀏覽器原生提示同時出現），沒有名稱的元素補上 aria-label。
 *  放一次在 App 最外層即可 */
export function TitleTooltips() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    let timer = 0;
    let cur: HTMLElement | null = null;
    const textOf = (el: HTMLElement) => {
      const t = el.getAttribute("title");
      if (t !== null) {   // React 改了 title 會再寫回來，所以每次都先搬一次
        el.dataset.tip = t;
        el.removeAttribute("title");
        if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", t);
      }
      return el.dataset.tip ?? "";
    };
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[title],[data-tip]") : null);
    const hide = () => { clearTimeout(timer); cur = null; setOpen(false); };
    const show = (el: HTMLElement, delay: number) => {
      const text = textOf(el);
      clearTimeout(timer);
      cur = el;
      if (!text) return;
      timer = window.setTimeout(() => {
        if (cur !== el || !el.isConnected) return;
        setTip({ text, rect: el.getBoundingClientRect() });
        setOpen(true);
      }, delay);
    };
    const over = (e: Event) => { const el = find(e.target); if (el && el !== cur) show(el, 400); else if (!el && cur) hide(); };
    const focus = (e: FocusEvent) => { const el = find(e.target); if (el && (e.target as HTMLElement).matches(":focus-visible")) show(el, 0); };
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  if (!tip) return null;
  const { rect } = tip;
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <TooltipTrigger asChild>
          <span aria-hidden className="pointer-events-none fixed" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top" sideOffset={6} collisionPadding={8} transition={reduce ? { duration: 0 } : SPRING}
            className="z-[70] max-w-xs whitespace-pre-line break-words rounded-xl bg-text px-2.5 py-1.5 text-xs text-panel shadow-[0_8px_20px_-8px_rgb(0_0_0/0.45)]">
            {tip.text}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Section({ title, step, right, children, dim }: { title: string; step?: number; right?: ReactNode; children: ReactNode; dim?: boolean }) {
  return (
    <section className={`card ${dim ? "opacity-50" : ""}`}>
      <div className="mb-3 flex items-center gap-2">
        {step !== undefined && <span className="flex size-7 items-center justify-center rounded-full bg-gold text-sm text-on-gold shadow-[0_2px_0_var(--c-gold-deep)]">{step}</span>}
        <h2 className="text-base">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

/** 拖曳／點選／貼上（Ctrl+V 截圖）圖片 */
export function DropZone({ onFiles, disabled, children, className = "" }: {
  onFiles: (files: File[]) => void; disabled?: boolean; children?: ReactNode; className?: string;
}) {
  const [over, setOver] = useState(false);
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true;
    input.onchange = () => input.files && onFiles([...input.files]);
    input.click();
  };
  return (
    <div tabIndex={disabled ? -1 : 0} role="button" aria-disabled={disabled}
      onClick={() => !disabled && pick()}
      onKeyDown={(e) => !disabled && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
      onPaste={(e) => { if (disabled) return; const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); onFiles(f); } }}
      onDragOver={(e) => { if (disabled) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-3 text-center text-xs text-mute transition outline-none focus-visible:border-acc focus-visible:ring-4 focus-visible:ring-acc/20 ${over ? "border-pink bg-pink-soft text-text" : "border-line hover:border-acc hover:text-text"} ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`}>
      {children ?? <><span className="text-lg leading-none">＋</span><span>拖曳、點選，或點一下後 Ctrl+V 貼上圖片</span></>}
    </div>
  );
}

/** 畫面出錯時顯示錯誤，不要整頁變白；切換分頁或按「再試一次」就恢復 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[EMochi] 畫面錯誤", error, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-[26px] bg-panel p-6 shadow-[var(--shadow-soft)]">
        <h2 className="mb-2 text-base text-bad">這個畫面出錯了</h2>
        <p className="mb-3 text-sm text-mute">資料都還在伺服器上。可以先按「再試一次」；如果一直出現，把下面這段錯誤訊息貼給我。</p>
        <pre className="mb-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-panel2 p-3 text-xs">{String(this.state.error.stack || this.state.error)}</pre>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>再試一次</button>
          <button className="btn" onClick={() => location.reload()}>重新載入頁面</button>
        </div>
      </div>
    );
  }
}

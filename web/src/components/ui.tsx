import { useEffect, useState, type ReactNode } from "react";
import type { GroupStatus, ProjectStatus } from "../api";
import { STATUS_TEXT } from "../api";

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-mute border-t-transparent ${className}`} />;
}

const tone: Record<string, string> = {
  done: "bg-ok/20 text-ok", preview_ready: "bg-ok/20 text-ok", review: "bg-warn/20 text-warn",
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

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1b2e]/55 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className={`max-h-[92vh] overflow-auto rounded-[26px] bg-panel p-6 shadow-2xl ${wide ? "w-[min(1200px,96vw)]" : "w-[min(780px,96vw)]"}`}
        onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
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

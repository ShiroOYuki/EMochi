import { useEffect, useState, type ReactNode } from "react";
import type { GroupStatus, ProjectStatus } from "../api";
import { STATUS_TEXT } from "../api";

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-mute border-t-transparent ${className}`} />;
}

const tone: Record<string, string> = {
  done: "bg-ok/20 text-ok", preview_ready: "bg-ok/20 text-ok", review: "bg-warn/20 text-warn",
  failed: "bg-bad/20 text-bad", draft: "bg-[#383a40] text-mute", pending: "bg-[#383a40] text-mute",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className={`max-h-[92vh] overflow-auto rounded-xl border border-line bg-panel p-5 ${wide ? "w-[min(1200px,96vw)]" : "w-[min(780px,96vw)]"}`}
        onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Section({ title, step, right, children, dim }: { title: string; step?: number; right?: ReactNode; children: ReactNode; dim?: boolean }) {
  return (
    <section className={`card ${dim ? "opacity-50" : ""}`}>
      <div className="mb-3 flex items-center gap-2">
        {step !== undefined && <span className="flex size-6 items-center justify-center rounded-full bg-sel text-xs font-semibold text-white">{step}</span>}
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

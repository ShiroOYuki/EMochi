import { useEffect, useState } from "react";
import type { GroupStatus, ProjectStatus } from "../../api";
import { STATUS_TEXT } from "../../api";
import { Spinner } from "./Spinner";

const tone: Record<string, string> = {
  done: "bg-ok/20 text-ok",
  preview_ready: "bg-gold/20 text-gold-deep",
  review: "bg-warn/20 text-warn",
  failed: "bg-bad/20 text-bad",
  draft: "bg-panel2 text-mute",
  pending: "bg-panel2 text-mute",
};

export function StatusBadge({ status }: { status: ProjectStatus | GroupStatus }) {
  const text =
    (STATUS_TEXT as Record<string, string>)[status] ??
    { pending: "等待中", running: "生成中", failed: "失敗" }[status as string] ??
    status;
  const busy = ["expanding", "previewing", "generating", "processing", "running"].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tone[status] ?? "bg-acc/20 text-acc"}`}
    >
      {busy && <Spinner className="size-3 border-acc border-t-transparent" />}
      {text}
    </span>
  );
}

/** 從 "YYYY-MM-DD HH:MM:SS" 開始經過的時間 */
export function Elapsed({ since }: { since?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(since.replace(" ", "T")).getTime()) / 1000));
  return (
    <span className="tabular-nums text-mute">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

import { useMemo } from "react";
import { BUSY } from "../../api";
import { StatusBadge } from "../../components/ui";
import { DeleteButton } from "../../components/manage";
import { StyleStep } from "./StyleStep";
import { PreviewStep } from "./PreviewStep";
import { PickStep } from "./PickStep";
import { GroupsStep } from "./GroupsStep";
import { type ViewProps } from "./shared";

export function ProjectView({ p, stickers, act, previewIds, maxParallel, defaultLayout, onOpenGallery, chars, onDelete }: ViewProps) {
  const stage = { expanding: 1, draft: 1, previewing: 2, preview_ready: 3, generating: 4, review: 4, processing: 5, done: 5 }[p.status];
  const steps = ["描述畫風", "風格預覽", "選擇貼圖", "生成與審核", "放入圖庫"];
  const byId = useMemo(() => new Map(stickers.map((s) => [s.id, s])), [stickers]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg">{p.id}<span className="ml-2 text-base font-normal text-mute">{p.name || "（未命名）"}</span></h2>
        <StatusBadge status={p.status} />
        <ol className="ml-auto flex flex-wrap gap-1 text-xs">
          {steps.map((s, i) => (
            <li key={s} className={`rounded-full px-2.5 py-1 ${i + 1 < stage ? "bg-ok/15 text-ok" : i + 1 === stage ? "bg-gold text-on-gold" : "bg-panel text-mute"}`}>{i + 1}. {s}</li>
          ))}
        </ol>
        <DeleteButton onClick={onDelete} disabled={BUSY.includes(p.status)} title={BUSY.includes(p.status) ? "執行中不能刪除" : "移到垃圾桶"} />
      </div>
      {p.error && <div className="rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn">{p.error}</div>}

      <StyleStep p={p} act={act} chars={chars} />
      <PreviewStep p={p} act={act} previewIds={previewIds} byId={byId} />
      {(p.status === "preview_ready" || p.groups.length > 0) &&
        <PickStep p={p} act={act} maxParallel={maxParallel} defaultLayout={defaultLayout} />}
      {p.groups.length > 0 && <GroupsStep p={p} act={act} byId={byId} onOpenGallery={onOpenGallery} />}
    </>
  );
}

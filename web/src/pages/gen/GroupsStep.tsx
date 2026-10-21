import { useState } from "react";
import { projectsApi, fileUrl, type Group, type Project, type Sticker } from "../../api";
import { Elapsed, Modal, ScrollRow, Section, Spinner, StatusBadge } from "../../components/ui";
import { type ViewProps, LogLink, FailedImage, TokenBadge } from "./shared";

// ---------- 4. 生成與審核 ----------

export function GroupsStep({
  p,
  act,
  byId,
  onOpenGallery,
}: {
  p: Project;
  act: ViewProps["act"];
  byId: Map<number, Sticker>;
  onOpenGallery: () => void;
}) {
  const done = p.groups.filter((g) => g.status === "done").length;
  const failed = p.groups.filter((g) => g.status === "failed").length;
  return (
    <Section
      title="生成與審核"
      step={4}
      right={
        <span className="text-xs text-mute">
          完成 {done} / {p.groups.length}
          {failed ? `，失敗 ${failed}` : ""}
        </span>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {p.groups.map((g) => (
          <GroupCard key={g.index} p={p} g={g} byId={byId} act={act} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4 text-sm">
        {p.status === "processing" && (
          <span className="flex items-center gap-2 text-mute">
            <Spinner />
            切割、去背、輸出各尺寸中…
          </span>
        )}
        {p.status === "review" && failed > 0 && (
          <span className="text-xs text-warn">失敗的組不會被處理，可以先按「重生」</span>
        )}
        {p.status === "done" ? (
          <>
            <span className="text-ok">已完成 {p.finished_ids?.length ?? 0} 張，已放入圖庫</span>
            <button className="btn" onClick={() => act(() => projectsApi.reopen(p.id))}>
              重新開啟（再重生某組）
            </button>
            <button className="btn btn-primary" onClick={onOpenGallery}>
              前往圖庫
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            disabled={p.status !== "review" || done === 0}
            onClick={() => act(() => projectsApi.finalize(p.id))}
          >
            確認，處理並放入圖庫
          </button>
        )}
      </div>
    </Section>
  );
}

function GroupCard({
  p,
  g,
  byId,
  act,
}: {
  p: Project;
  g: Group;
  byId: Map<number, Sticker>;
  act: ViewProps["act"];
}) {
  const [zoom, setZoom] = useState(false);
  const canRegen =
    (p.status === "review" || p.status === "generating") && (g.status === "done" || g.status === "failed");
  return (
    <div className="rounded-2xl border border-line bg-panel2 p-3">
      {/* 標題列與表情標籤都固定一行：放不下時橫向捲動（邊緣淡出），四組卡片的高度才會一致 */}
      <div className="mb-2 flex items-center gap-2">
        <ScrollRow className="min-w-0 flex-1 items-center gap-2">
          <span>第 {g.index} 組</span>
          <span className="text-xs text-mute">
            {g.layout}，{g.ids.length} 張
          </span>
          <StatusBadge status={g.status} />
          {g.status === "running" && <Elapsed since={g.started} />}
          {g.status === "done" && g.accepted && (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn" title={g.message}>
              手動通過
            </span>
          )}
          {(g.attempts ?? 0) > 1 && <span className="text-xs text-mute">第 {g.attempts} 次</span>}
          {g.status !== "running" && <TokenBadge tokens={g.tokens} />}
        </ScrollRow>
        <div className="flex shrink-0 gap-1.5 whitespace-nowrap">
          {g.log && <LogLink path={g.log} style={p.id} />}
          <button
            className="btn btn-sm"
            disabled={!canRegen}
            onClick={() => act(() => projectsApi.regenerate(p.id, g.index))}
          >
            重生
          </button>
        </div>
      </div>
      <ScrollRow className="mb-2 gap-1">
        {g.ids.map((i) => (
          <span
            key={i}
            title={byId.get(i)?.zh}
            className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-mute"
          >
            #{i} {byId.get(i)?.label}
          </span>
        ))}
      </ScrollRow>
      {g.status === "done" ? (
        <>
          <img
            src={fileUrl(g.image, g.finished)}
            onClick={() => setZoom(true)}
            className="w-full cursor-pointer rounded-md"
          />
          <Modal open={zoom} onClose={() => setZoom(false)} wide>
            <img src={fileUrl(g.image, g.finished)} className="w-full rounded-lg" />
          </Modal>
        </>
      ) : g.status === "failed" ? (
        <FailedImage
          path={g.image}
          v={g.finished}
          message={g.message ?? ""}
          className="w-full"
          rechecked={g.rechecked}
          onRecheck={canRegen ? () => act(() => projectsApi.recheck(p.id, g.index)) : undefined}
          onAccept={canRegen ? () => act(() => projectsApi.accept(p.id, g.index)) : undefined}
        />
      ) : (
        <div className="flex aspect-[3/2] items-center justify-center rounded-md bg-panel text-sm text-mute">
          {g.status === "running" ? (
            <span className="flex items-center gap-2">
              <Spinner />
              生成中
            </span>
          ) : (
            "排隊中"
          )}
        </div>
      )}
    </div>
  );
}

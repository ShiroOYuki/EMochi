import { useState } from "react";
import { api, fileUrl, type Project, type Sticker } from "../../api";
import { Elapsed, Modal, Section, Spinner } from "../../components/ui";
import { type ViewProps, LogLink, FailedImage, TokenBadge } from "./shared";

// ---------- 2. 風格預覽 ----------

export function PreviewStep({ p, act, previewIds, byId }: { p: Project; act: ViewProps["act"]; previewIds: number[]; byId: Map<number, Sticker> }) {
  const pv = p.preview;
  const [zoom, setZoom] = useState(false);
  if (!pv && p.status !== "previewing") {
    return <Section title="風格預覽" step={2} dim>
      <p className="text-sm text-mute">確認畫風描述後，會先用 {previewIds.map((i) => byId.get(i)?.label ?? `#${i}`).join("、")} 這 {previewIds.length} 個表情生成一張 2×2 預覽圖。確認風格後，這張圖會當作後續所有組別的畫風範本。</p>
    </Section>;
  }
  return (
    <Section title="風格預覽" step={2} right={pv?.log && <LogLink path={pv.log} style={p.id} />}>
      {pv?.status === "running" ? (
        <div className="flex items-center gap-2 text-mute"><Spinner />Codex 正在生成預覽圖 <Elapsed since={pv.started} />（通常 1～3 分鐘）</div>
      ) : pv?.status === "failed" ? (
        <FailedImage path={pv.image} v={p.updated} message={`預覽失敗：${pv.message}`} className="w-72" tokens={pv.tokens}
          onRecheck={() => act(() => api.post<Project>(`/api/projects/${p.id}/recheck/preview`))} />
      ) : pv ? (
        <div className="flex flex-wrap items-start gap-4">
          <img src={fileUrl(pv.image, p.updated)} onClick={() => setZoom(true)} className="w-72 cursor-pointer rounded-lg" />
          <div className="max-w-md space-y-2 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-mute">{pv.message}<TokenBadge tokens={pv.tokens} /></p>
            {p.status === "preview_ready" && <>
              <p>喜歡這個風格嗎？</p>
              <ul className="list-disc space-y-1 pl-5 text-mute">
                <li>喜歡：在下方「選擇貼圖」勾選表情並開始生成。</li>
                <li>不喜歡：改上面的畫風描述，按「重新產生預覽」；或改需求後「重新擴寫」。</li>
              </ul>
            </>}
          </div>
          <Modal open={zoom} onClose={() => setZoom(false)}><img src={fileUrl(pv.image, p.updated)} className="w-full rounded-lg" /></Modal>
        </div>
      ) : null}
      {pv?.status === "failed" && <button className="btn mt-3" onClick={() => act(() => api.post<Project>(`/api/projects/${p.id}/preview`))}>重新生成預覽</button>}
    </Section>
  );
}

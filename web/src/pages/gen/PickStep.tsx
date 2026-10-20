import { useEffect, useRef, useState } from "react";
import { projectsApi, type Project } from "../../api";
import { Section } from "../../components/ui";
import StickerPicker from "../../components/StickerPicker";
import { useStickers } from "../../stickers";
import { type ViewProps } from "./shared";

// ---------- 3. 選擇貼圖 ----------

const LAYOUT_OPTIONS: { id: "3x2" | "4x2w"; label: string; hint: string }[] = [
  { id: "4x2w", label: "4×2 寬版 2:1（每組 8 張）", hint: "2048×1024，每格 512 正方形，32 張只要 4 組" },
  { id: "3x2", label: "3×2（每組 6 張）", hint: "1536×1024，每格 512 正方形；2:1 出問題時的備案" },
];

export function PickStep({
  p,
  act,
  maxParallel,
  defaultLayout,
}: {
  p: Project;
  act: ViewProps["act"];
  maxParallel: number;
  defaultLayout: "3x2" | "4x2w";
}) {
  const locked = p.status !== "preview_ready";
  // 新專案預設勾「表情」分頁裡標了「Gen 預設勾選」的分組；表情清單還沒載入完時，載入後補上（使用者動過就不再覆蓋）
  const { defaults, loaded } = useStickers();
  const touched = useRef(false);
  const [ids, setIdsRaw] = useState<number[]>(p.sticker_ids.length ? p.sticker_ids : defaults);
  const setIds = (v: number[]) => {
    touched.current = true;
    setIdsRaw(v);
  };
  useEffect(() => {
    if (p.sticker_ids.length) setIdsRaw(p.sticker_ids);
  }, [p.sticker_ids]);
  useEffect(() => {
    if (loaded && !p.sticker_ids.length && !touched.current) setIdsRaw(defaults);
  }, [loaded, defaults, p.sticker_ids.length]);
  const [layout, setLayout] = useState<"3x2" | "4x2w">(defaultLayout); // 預設值在設定頁改
  const size = layout === "4x2w" ? 8 : 6;
  const groups = Math.ceil(ids.length / size);
  return (
    <Section title="確認風格，選擇要生成的貼圖" step={3} dim={locked}>
      {locked && p.groups.length > 0 ? (
        <p className="text-sm text-mute">
          已送出 {p.sticker_ids.length} 張、{p.groups.length}{" "}
          組。想換一批表情，可以再開一個新畫風，或沿用描述另建專案。
        </p>
      ) : (
        <>
          <StickerPicker value={ids} onChange={setIds} groupSize={size} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm">網格版型</span>
            {LAYOUT_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setLayout(o.id)}
                aria-pressed={layout === o.id}
                title={o.hint}
                className={`rounded-full border-2 px-3 py-0.5 text-xs transition ${layout === o.id ? "border-pink bg-pink-soft" : "border-line text-mute hover:border-acc"}`}
              >
                {o.label}
              </button>
            ))}
            <span className="text-[11px] text-mute">{LAYOUT_OPTIONS.find((o) => o.id === layout)?.hint}</span>
          </div>
          <div className="mt-3 flex items-center justify-end gap-3 text-xs text-mute">
            <span>
              同時最多 {maxParallel} 組，預估 {Math.ceil(groups / maxParallel) * 3} 分鐘左右
            </span>
            <button
              className="btn btn-primary"
              disabled={!ids.length}
              onClick={() => act(() => projectsApi.generate(p.id, ids, layout))}
            >
              開始生成 {ids.length} 張（{groups} 組）
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

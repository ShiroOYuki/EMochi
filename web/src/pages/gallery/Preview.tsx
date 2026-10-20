import { fileUrl } from "../../api";
import { Check } from "../../components/ui";
import type { Entry } from "./shared";

/** 點卡片打開的大圖：原圖＋實際尺寸（Discord 深色、白色背景），左右切換、勾選 */
export function Preview({
  e,
  on,
  onToggle,
  onPrev,
  onNext,
}: {
  e: Entry;
  on: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const f = e.it.files;
  const sizes = (bg: string) => (
    <div className={`flex items-center gap-3 rounded-lg p-3 ${bg}`}>
      {(["t112", "t56", "t28"] as const)
        .filter((k) => f[k])
        .map((k) => {
          const px = +k.slice(1);
          return (
            <img key={k} src={fileUrl(`outputs/${f[k]}`, e.it.mtime)} style={{ width: px, height: px }} />
          );
        })}
    </div>
  );
  return (
    <>
      <h3 className="mb-3">
        {e.s.id} #{e.it.id} {e.it.label}
        <span className="ml-2 text-sm font-normal text-mute">{e.it.zh}</span>
      </h3>
      <div className="flex flex-wrap items-start gap-5">
        <img src={fileUrl(`outputs/${f.master}`, e.it.mtime)} className="checker size-64 rounded-lg" />
        <div className="space-y-2">
          {sizes("bg-[#313338]")}
          {sizes("bg-white border border-line")}
          <p className="text-xs text-mute">實際尺寸 112 / 56 / 28（Discord 深色、白色背景）</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button className="btn" onClick={onPrev}>
          上一張
        </button>
        <label className="flex items-center gap-2 text-sm">
          <Check checked={on} onCheckedChange={onToggle} />
          勾選這張（空白鍵）
        </label>
        <button className="btn" onClick={onNext}>
          下一張
        </button>
      </div>
    </>
  );
}

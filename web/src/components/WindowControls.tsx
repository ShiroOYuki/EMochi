import { useEffect, useState } from "react";
import { desktop } from "../desktop";

/** 桌面版的縮小／最大化／關閉（視窗沒有 Windows 原生標題列）；網頁版不顯示。
 *  外觀跟分頁列同一套：panel2 膠囊底＋圓形按鈕，關閉滑過變紅 */
export function WindowControls() {
  const w = desktop?.window;
  const [max, setMax] = useState(() => w?.isMaximized() ?? false);
  useEffect(() => w?.onMaximized(setMax), [w]);
  if (!w) return null;
  const base =
    "grid size-8 place-items-center rounded-full text-mute outline-none transition-colors focus-visible:ring-3 focus-visible:ring-acc/40";
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-panel2 p-1" role="group" aria-label="視窗">
      <button
        className={`${base} hover:bg-panel hover:text-text`}
        onClick={w.minimize}
        aria-label="最小化"
        title="最小化"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <button
        className={`${base} hover:bg-panel hover:text-text`}
        onClick={w.toggleMaximize}
        aria-label={max ? "還原" : "最大化"}
        title={max ? "還原" : "最大化"}
      >
        {max ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <rect x="1.7" y="3.7" width="6.6" height="6.6" rx="1.6" />
            <path d="M4 1.7h4.3a2 2 0 0 1 2 2V8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <rect x="1.8" y="1.8" width="8.4" height="8.4" rx="2" />
          </svg>
        )}
      </button>
      <button
        className={`${base} hover:bg-bad hover:text-white`}
        onClick={w.close}
        aria-label="關閉"
        title="關閉"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

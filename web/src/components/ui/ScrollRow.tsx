import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** 單行橫向列：內容固定一行，放不下時可以橫向捲動，被截掉的那一側淡出提示還有內容。
 *  - 預設（標籤列這種矮的）：直向滾輪也能橫向捲動、文字不換行
 *  - arrows（圖庫並排比較這種卡片列）：兩側多左右箭頭翻頁；滾輪照常捲動頁面（觸控板左右滑、Shift＋滾輪可橫捲），卡片內文字照常換行 */
export function ScrollRow({
  children,
  className,
  arrows,
}: {
  children: ReactNode;
  className?: string;
  arrows?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [edge, setEdge] = useState({ l: false, r: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 2,
      r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 直向滾輪轉成橫向捲動（只在真的放不下時攔截，否則照常捲動頁面）
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    if (!arrows) el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", wheel);
    };
  }, [update, arrows]);
  useEffect(update); // 內容數量變了（篩選、重新整理）也要重算
  const fade = arrows ? 48 : 24;
  const mask =
    edge.l || edge.r
      ? `linear-gradient(to right, ${edge.l ? `transparent, #000 ${fade}px` : "#000"}, ${edge.r ? `#000 calc(100% - ${fade}px), transparent` : "#000"})`
      : undefined;
  const row = (
    <div
      ref={ref}
      className={cn(
        "no-scrollbar flex min-w-0 flex-nowrap overflow-x-auto [&>*]:shrink-0",
        !arrows && "whitespace-nowrap",
        className,
      )}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {children}
    </div>
  );
  if (!arrows) return row;
  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el)
      el.scrollBy({ left: dir * Math.max(140, el.clientWidth - 160), behavior: reduce ? "auto" : "smooth" });
  };
  const arrow =
    "row-arrow absolute top-1/2 z-20 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-panel text-text shadow-[var(--shadow-soft)] transition hover:border-acc hover:text-acc active:scale-95";
  return (
    <div className="relative">
      {row}
      {edge.l && (
        <button className={`${arrow} -left-2`} onClick={() => page(-1)} aria-label="往左看更多">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8.5 3 4.5 7l4 4" />
          </svg>
        </button>
      )}
      {edge.r && (
        <button className={`${arrow} -right-2`} onClick={() => page(1)} aria-label="往右看更多">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5.5 3l4 4-4 4" />
          </svg>
        </button>
      )}
    </div>
  );
}

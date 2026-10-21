import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/animate-ui/primitives/radix/tooltip";
import { SPRING } from "./motion";

/** 全站的 title 提示改成動畫 Tooltip：滑過（或用 Tab 聚焦）任何有 title 的元素，0.4 秒後浮出。
 *  不用一個一個改呼叫端：第一次碰到時把 title 搬到 data-tip（避免瀏覽器原生提示同時出現），沒有名稱的元素補上 aria-label。
 *  放一次在 App 最外層即可 */
export function TitleTooltips() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    let timer = 0;
    let cur: HTMLElement | null = null;
    const textOf = (el: HTMLElement) => {
      const t = el.getAttribute("title");
      if (t !== null) {
        // React 改了 title 會再寫回來，所以每次都先搬一次
        el.dataset.tip = t;
        el.removeAttribute("title");
        if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", t);
      }
      return el.dataset.tip ?? "";
    };
    const find = (t: EventTarget | null) =>
      t instanceof Element ? t.closest<HTMLElement>("[title],[data-tip]") : null;
    const hide = () => {
      clearTimeout(timer);
      cur = null;
      setOpen(false);
    };
    const show = (el: HTMLElement, delay: number) => {
      const text = textOf(el);
      clearTimeout(timer);
      cur = el;
      if (!text) return;
      timer = window.setTimeout(() => {
        if (cur !== el || !el.isConnected) return;
        setTip({ text, rect: el.getBoundingClientRect() });
        setOpen(true);
      }, delay);
    };
    const over = (e: Event) => {
      const el = find(e.target);
      if (el && el !== cur) show(el, 400);
      else if (!el && cur) hide();
    };
    const focus = (e: FocusEvent) => {
      const el = find(e.target);
      if (el && (e.target as HTMLElement).matches(":focus-visible")) show(el, 0);
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  if (!tip) return null;
  const { rect } = tip;
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      >
        <TooltipTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          />
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="top"
            sideOffset={6}
            collisionPadding={8}
            transition={reduce ? { duration: 0 } : SPRING}
            className="z-[70] max-w-xs whitespace-pre-line break-words rounded-xl bg-text px-2.5 py-1.5 text-xs text-panel shadow-[0_8px_20px_-8px_rgb(0_0_0/0.45)]"
          >
            {tip.text}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

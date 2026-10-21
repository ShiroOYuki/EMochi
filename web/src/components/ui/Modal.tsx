import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/animate-ui/primitives/radix/dialog";
import { cn } from "@/lib/utils";
import { SPRING } from "./motion";

/** 彈窗：Animate UI 的 Radix Dialog（焦點鎖定、Esc／點外面關閉、開關動畫）。
 *  介面跟舊版一樣：open / onClose / wide；label 給螢幕閱讀器用（畫面上不顯示） */
export function Modal({
  open,
  onClose,
  children,
  wide,
  label = "對話框",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  label?: string;
  /** 加在框本身的 class（例如設定頁未儲存時的紅框、搖晃） */
  className?: string;
}) {
  const reduce = useReducedMotion();
  // 關閉時呼叫端通常會把內容清掉（例如 target 變 null）；留住最後一次的內容，收起動畫期間框才不會先變空白
  const last = useRef<ReactNode>(children);
  if (open) last.current = children;
  // 記住打開前焦點在哪（例如垃圾桶按鈕），關閉後還給它；沒有可聚焦的來源就維持瀏覽器預設
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    const a = document.activeElement;
    opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
  }
  wasOpen.current = open;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay
          className="no-drag fixed inset-0 z-50 bg-[#1d1b2e]/55 backdrop-blur-[2px]"
          transition={reduce ? { duration: 0 } : undefined}
        />
        <DialogContent
          aria-describedby={undefined}
          from="top"
          transition={reduce ? { duration: 0 } : SPRING}
          // 置中用 inset-0 + m-auto + h-fit（不用 translate -50%：寬高是奇數時會落在半像素上，文字發糊）
          // 打開時焦點放在框本身（仍鎖在框內），不要自動跳到第一顆按鈕上冒出焦點框；框裡有 autoFocus 的就交給它
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const el = e.currentTarget as HTMLElement;
            if (!el.contains(document.activeElement)) el.focus();
          }}
          onCloseAutoFocus={(e) => {
            const o = opener.current;
            if (o?.isConnected) {
              e.preventDefault();
              o.focus({ preventScroll: true });
            }
          }}
          className={cn(
            "no-drag scroll-inset fixed inset-0 z-50 m-auto h-fit max-h-[92vh] overflow-auto overscroll-contain rounded-[26px] bg-panel p-6 shadow-2xl outline-none",
            wide ? "w-[min(1200px,96vw)]" : "w-[min(780px,96vw)]",
            className,
          )}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {open ? children : last.current}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

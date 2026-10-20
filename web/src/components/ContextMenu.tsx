/** 側欄右鍵選單：useContextMenu 回傳 [選單元素, 打開選單的函式]；MenuIcons 是常用的選單圖示 */
import { useCallback, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHighlight,
  DropdownMenuHighlightItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/primitives/radix/dropdown-menu";
import { SPRING } from "./ui";
import { useReducedMotion } from "motion/react";
import { TrashIcon } from "./icons";

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
      onSelect: () => void;
    }
  | "sep";

/** 用法：const [menu, openMenu] = useContextMenu(); <div onContextMenu={(e) => openMenu(e, items)} />，並把 {menu} 放進畫面 */
export function useContextMenu(): [ReactNode, (e: RMouseEvent, items: MenuItem[]) => void] {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((e: RMouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, items });
    setOpen(true);
  }, []);
  // state 在關閉後保留，收起動畫期間選單內容才不會先消失
  const menu = state && <ContextMenu {...state} open={open} onOpenChange={setOpen} />;
  return [menu, show];
}

/** 用 Animate UI 的 Radix DropdownMenu 做右鍵選單：在游標位置放一個看不見的觸發點。
 *  得到：淡入縮放、滑過時底色用彈簧滑到該項、方向鍵／Home／End／字首跳選、Esc 關閉、碰到視窗邊緣自動翻轉 */
function ContextMenu({
  x,
  y,
  items,
  open,
  onOpenChange,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        collisionPadding={8}
        transition={reduce ? { duration: 0 } : { duration: 0.12, ease: "easeOut" }}
        onContextMenu={(e) => e.preventDefault()}
        className="z-[60] min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl border border-line bg-panel p-1.5 text-sm shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] outline-none"
      >
        <DropdownMenuHighlight
          className="absolute inset-0 z-0 rounded-xl bg-panel2"
          transition={reduce ? { duration: 0 } : SPRING}
        >
          {items.map((it, i) =>
            it === "sep" ? (
              <DropdownMenuSeparator key={i} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenuHighlightItem
                key={i}
                disabled={it.disabled}
                activeClassName={it.danger ? "!bg-bad/12" : ""}
              >
                <DropdownMenuItem
                  disabled={it.disabled}
                  title={it.hint}
                  onSelect={() => it.onSelect()}
                  className={`relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-1.5 outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40 ${it.danger ? "text-bad" : ""}`}
                >
                  <span className="flex w-4 justify-center text-mute">{it.icon}</span>
                  {it.label}
                </DropdownMenuItem>
              </DropdownMenuHighlightItem>
            ),
          )}
        </DropdownMenuHighlight>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const MenuIcons = {
  open: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  ),
  copy: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  ),
  gallery: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  ),
  trash: <TrashIcon size={14} />,
};

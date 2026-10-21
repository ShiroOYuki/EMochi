import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Select as SelectPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

/** 下拉選單：取代原生 <select>（原生展開後的清單是作業系統畫的，顏色、圓角、深色主題都改不了）。
 *  用 Radix Select：鍵盤上下選、字首跳選、Esc 關閉、碰到視窗邊緣自動翻到上方；外觀跟右鍵選單一致。
 *  value 可以是數字或字串（Radix 只吃字串，這裡自動轉換）；空字串的選項當成 placeholder 顯示 */
export type SelectOption<T extends string | number> = { value: T; label: ReactNode };

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
  className,
  placeholder,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
  className?: string;
  placeholder?: ReactNode;
  label?: string;
}) {
  const real = options.filter((o) => String(o.value) !== "");
  const empty = options.find((o) => String(o.value) === "");
  const cur = String(value);
  return (
    <SelectPrimitive.Root
      value={cur === "" ? undefined : cur}
      disabled={disabled}
      onValueChange={(v) => {
        const o = real.find((x) => String(x.value) === v);
        if (o) onChange(o.value);
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          "input group flex cursor-pointer items-center justify-between gap-2 text-left hover:border-acc hover:bg-panel data-[placeholder]:text-mute data-[state=open]:border-acc data-[state=open]:bg-panel disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:bg-panel2",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value placeholder={placeholder ?? empty?.label ?? "請選擇"} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="size-4 shrink-0 text-mute transition-[transform,color] duration-200 group-hover:text-acc group-disabled:group-hover:text-mute group-data-[state=open]:rotate-180 group-data-[state=open]:text-acc" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="select-pop z-[60] min-w-(--radix-select-trigger-width) max-w-[min(32rem,calc(100vw-16px))] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-2xl border border-line bg-panel p-1.5 text-sm text-text shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] outline-none"
        >
          <SelectPrimitive.Viewport className="scroll-inset-sm max-h-[min(20rem,var(--radix-select-content-available-height))] overflow-y-auto">
            {real.map((o) => (
              <SelectPrimitive.Item
                key={String(o.value)}
                value={String(o.value)}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-xl py-1.5 pr-3 pl-8 outline-none transition-colors duration-100 data-[highlighted]:bg-panel2 data-[state=checked]:text-acc data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5 flex items-center">
                  <CheckIcon className="size-3.5" strokeWidth={2.5} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

import { cn } from "@/lib/utils";
import { Checkbox, CheckboxIndicator } from "@/components/animate-ui/primitives/radix/checkbox";

/** 勾選框：Animate UI 的 Radix Checkbox（勾勾用畫線方式出現），勾選後是耳內粉。
 *  放在 <label> 裡時，點文字也會切換（button 是可被 label 啟動的元素） */
export function Check({
  checked,
  onCheckedChange,
  className,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
  label?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      aria-label={label}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border-2 border-line bg-panel text-white outline-none transition-colors focus-visible:ring-3 focus-visible:ring-acc/40 data-[state=checked]:border-pink data-[state=checked]:bg-pink",
        className,
      )}
    >
      <CheckboxIndicator className="size-3" />
    </Checkbox>
  );
}

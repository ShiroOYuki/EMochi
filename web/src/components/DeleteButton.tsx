/** 刪除按鈕：DeleteButton（頁面內容裡）、SideDeleteIcon（側欄項目右上角，滑過才出現） */
import { TrashIcon } from "./icons";

/** 頁面內容裡的刪除按鈕（外框款，滑過變紅） */
export function DeleteButton({
  onClick,
  disabled,
  title,
  label = "刪除",
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  label?: string;
}) {
  return (
    <button
      className="btn text-mute hover:border-bad hover:text-bad"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <TrashIcon size={14} />
      {label}
    </button>
  );
}

/** 側欄項目右上角的垃圾桶；外層要有 `group relative` */
export function SideDeleteIcon({
  onClick,
  disabled,
  label,
  shown,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  shown?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "執行中不能刪除" : label}
      aria-label={label}
      className={`absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-panel/80 text-mute transition hover:bg-bad/15 hover:text-bad focus-visible:opacity-100 disabled:hover:bg-transparent disabled:hover:text-mute ${shown ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
    >
      <TrashIcon />
    </button>
  );
}

// ---------- 右鍵選單 ----------

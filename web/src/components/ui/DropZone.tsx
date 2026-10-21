import { useState, type ReactNode } from "react";

/** 拖曳／點選／貼上（Ctrl+V 截圖）圖片 */
export function DropZone({
  onFiles,
  disabled,
  children,
  className = "",
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => input.files && onFiles([...input.files]);
    input.click();
  };
  return (
    <div
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-disabled={disabled}
      onClick={() => !disabled && pick()}
      onKeyDown={(e) => !disabled && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
      onPaste={(e) => {
        if (disabled) return;
        const f = [...e.clipboardData.files];
        if (f.length) {
          e.preventDefault();
          onFiles(f);
        }
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles([...e.dataTransfer.files]);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-3 text-center text-xs text-mute transition outline-none focus-visible:border-acc focus-visible:ring-4 focus-visible:ring-acc/20 ${over ? "border-pink bg-pink-soft text-text" : "border-line hover:border-acc hover:text-text"} ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`}
    >
      {children ?? (
        <>
          <span className="text-lg leading-none">＋</span>
          <span>拖曳、點選，或點一下後 Ctrl+V 貼上圖片</span>
        </>
      )}
    </div>
  );
}

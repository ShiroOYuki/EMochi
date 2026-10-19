import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合併 className：後面的 Tailwind class 會覆蓋前面衝突的（shadcn / Animate UI 元件共用） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

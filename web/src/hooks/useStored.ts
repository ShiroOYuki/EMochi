import { useEffect, useState } from "react";

/** 跟 useState 一樣，但值會記在這台電腦的 localStorage（讀寫失敗就只在這次有效） */
export function useStored<T>(key: string, init: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 私密模式等情況忽略 */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

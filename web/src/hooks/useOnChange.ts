import { useEffect, useRef, useState } from "react";

// 分頁用 <Activity> 隱藏時 effect 會被清掉、切回來時重跑（App.tsx）。
// 「伺服器的值變了就重設表單」「按了新增就聚焦」這類只該在值真的變時做的事，
// 寫成 useEffect 的話，每次切回分頁都會重做一次（表單被重設、輸入框一直閃）。用下面兩個 hook 代替。

/** key 變了才呼叫 onChange（在 render 時比對，不是 effect，所以切回分頁不會重跑）；
 *  onChange 裡只能 setState，不能碰 DOM */
export function useOnChange(key: unknown, onChange: () => void) {
  const [prev, setPrev] = useState(key);
  if (!Object.is(prev, key)) {
    setPrev(key);
    onChange();
  }
}

/** n 增加時（例如每按一次「新增」+1）跑一次 effect；切回分頁時 n 沒變就不跑。
 *  第一次掛上時 n 已經大於 0 也會跑（例如按「新增」才出現的表單） */
export function useEffectOnBump(n: number, effect: () => void | (() => void)) {
  const done = useRef(0);
  useEffect(() => {
    if (!n || n === done.current) return;
    done.current = n;
    return effect();
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps -- 只看 n
}

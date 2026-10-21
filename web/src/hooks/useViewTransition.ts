import { flushSync } from "react-dom";
import { useReducedMotion } from "motion/react";

/** 一次最多替幾個元素做位置動畫（只算畫面上看得到的） */
const VT_MAX = 120;

/** 用瀏覽器原生的 View Transitions 讓卡片滑到新位置（留下的滑過去、消失的淡出、新的淡入）。
 *  要動畫的元素加上 data-vt={vtName(key)}；只替「畫面上看得到的」命名（切換前後各量一次），
 *  畫面外的直接換，所以幾百張也不會卡；動畫結束就把名字清掉。系統設定減少動態效果時直接切換 */
export function useViewTransition() {
  const reduce = useReducedMotion();
  const supported = !reduce && "startViewTransition" in document;

  const withTransition = (update: () => void) => {
    if (!supported) return update();
    const elements = () => document.querySelectorAll<HTMLElement>("[data-vt]");
    const nameVisible = () => {
      let named = 0;
      elements().forEach((el) => {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.bottom > -80 && r.top < innerHeight + 80 && named < VT_MAX;
        if (visible) named++;
        el.style.viewTransitionName = visible ? el.dataset.vt! : "";
      });
    };
    nameVisible();
    const t = document.startViewTransition(() => {
      flushSync(update);
      nameVisible();
    });
    t.finished.finally(() =>
      elements().forEach((el) => {
        el.style.viewTransitionName = "";
      }),
    );
  };
  /** view-transition-name 只能用 CSS 識別字的字元 */
  const vtName = (key: string) => `g-${key.replace(/[^\w-]/g, "_")}`;
  return { withTransition, vtName };
}

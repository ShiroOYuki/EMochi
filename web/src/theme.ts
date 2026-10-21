/** 介面主題：偏好（跟隨系統／淺色／深色）存在伺服器的 settings.local.json（/api/ui-prefs）。
 *  localStorage 只當快取，讓 index.html 在畫面出來前先套用、不閃白；以伺服器為準。
 *  Navbar 的切換鈕、設定頁共用這個 store */
import { useSyncExternalStore } from "react";
import { uiPrefsApi, type ThemePref } from "./api";
import { desktop } from "./desktop";

export type { ThemePref };
const media = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function cached(): ThemePref {
  try {
    const p = localStorage.getItem("themePref");
    if (p === "system" || p === "light" || p === "dark") return p;
    const old = localStorage.getItem("theme"); // 舊版只記淺／深
    if (old === "light" || old === "dark") return old;
  } catch {
    /* 私密模式等 */
  }
  return "system";
}

let pref: ThemePref = cached();

export const resolved = (p: ThemePref = pref): "light" | "dark" =>
  p === "system" ? (media.matches ? "dark" : "light") : p;

function apply() {
  document.documentElement.dataset.theme = resolved();
  try {
    localStorage.setItem("themePref", pref);
    localStorage.setItem("theme", resolved());
  } catch {
    /* 忽略 */
  }
  desktop?.setTheme?.(pref); // 桌面版：視窗底色、原生對話框跟著換
  listeners.forEach((f) => f());
}

media.addEventListener("change", () => {
  if (pref === "system") apply();
});

/** 使用者改主題：立即套用並存到伺服器 */
export function setThemePref(p: ThemePref) {
  pref = p;
  apply();
  uiPrefsApi.set({ theme: p }).catch(() => {
    /* 存不了就只在這次生效 */
  });
}

/** 啟動時跟伺服器同步一次（快取和伺服器不同時以伺服器為準） */
export async function loadThemePref() {
  try {
    const r = await uiPrefsApi.get();
    // 設定檔還沒存過主題、但瀏覽器裡有舊版留下的選擇 → 搬到設定檔（只發生一次）
    if (!r.stored && pref !== "system") {
      setThemePref(pref);
      return;
    }
    if (r.theme !== pref) {
      pref = r.theme;
      apply();
    }
  } catch {
    /* 伺服器沒回應就沿用快取 */
  }
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => pref,
  );
}

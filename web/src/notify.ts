/** 桌面通知：生圖完成／失敗時提醒（視窗不在前景才跳）
 *  後端把事件記在 /api/events（app/events.py），這裡每 3 秒拿一次新的；不管停在哪個分頁都收得到。
 *  桌面版走 Electron 原生通知（window.emochi.notify），網頁版用瀏覽器的 Notification（要先允許）。
 *  點通知：視窗叫到前面 → 切到「生成」分頁 → 打開那個專案 */
import { useEffect, useSyncExternalStore } from "react";
import { systemApi, uiPrefsApi, type AppEvent } from "./api";
import { desktop } from "./desktop";

const POLL_MS = 3000;
const OPEN_EVENT = "emochi:open-project";
const listeners = new Set<() => void>();
let enabled = true;
const emit = () => listeners.forEach((f) => f());

export type { AppEvent };

/** 設定頁開關：立即存到 settings.local.json */
export function setNotifyPref(v: boolean) {
  enabled = v;
  emit();
  uiPrefsApi.set({ notify: v }).catch(() => {
    /* 存不了就只在這次生效 */
  });
}
export function useNotifyPref(): boolean {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => enabled,
  );
}

/** 切到生成分頁並打開專案（GenPage 用 onOpenProject 接） */
export function openProject(id: string) {
  location.hash = "#/gen";
  window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: id }));
}
export function onOpenProject(cb: (id: string) => void) {
  const h = (e: Event) => cb((e as CustomEvent<string>).detail);
  window.addEventListener(OPEN_EVENT, h);
  return () => window.removeEventListener(OPEN_EVENT, h);
}

/** 網頁版的瀏覽器通知權限；桌面版不用問 */
export type Permission = "desktop" | "granted" | "denied" | "default" | "unsupported";
export function permission(): Permission {
  if (desktop?.notify) return "desktop";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}
export async function requestPermission(): Promise<Permission> {
  if (permission() === "default") await Notification.requestPermission();
  return permission();
}

/** 直接發一則通知（不看前景與開關；測試通知也走這裡）；回傳有沒有發出去 */
export async function showNotification(n: {
  title: string;
  body?: string;
  project?: string;
}): Promise<boolean> {
  if (desktop?.notify) {
    try {
      return await desktop.notify(n);
    } catch {
      return false;
    }
  }
  if (permission() !== "granted") return false;
  const note = new Notification(n.title, {
    body: n.body,
    icon: "/icon-192.png",
    tag: n.project ? `emochi-${n.project}` : undefined,
  });
  note.onclick = () => {
    window.focus();
    if (n.project) openProject(n.project);
    note.close();
  };
  return true;
}

/** App 掛一次：讀開關、輪詢事件、接桌面版的通知點擊 */
export function useNotifier() {
  useEffect(() => {
    uiPrefsApi
      .get()
      .then((r) => {
        if (typeof r.notify === "boolean" && r.notify !== enabled) {
          enabled = r.notify;
          emit();
        }
      })
      .catch(() => {
        /* 沿用預設（開） */
      });

    let seq = -1; // -1：第一次只同步目前的 seq，不補發舊事件
    let boot = "";
    let stop = false;
    let timer = 0;
    const tick = async () => {
      try {
        const r = await systemApi.events(seq, boot);
        seq = r.seq;
        boot = r.boot;
        if (enabled && !document.hasFocus()) {
          for (const e of r.events)
            await showNotification({ title: e.title, body: e.body, project: e.project });
        }
      } catch {
        /* 伺服器暫時沒回應：下次再拿 */
      }
      if (!stop) timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    const off = desktop?.onNotifyClick?.(openProject);
    return () => {
      stop = true;
      clearTimeout(timer);
      off?.();
    };
  }, []);
}

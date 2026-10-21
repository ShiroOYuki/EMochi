// 網址（hash）路由：#/<分頁>[/<id>]，例如 #/gen/s12、#/characters/c2、#/styles/st1、#/gallery
// 五個分頁都一直掛在畫面上（切換不會丟失輸入），所以不用一般的 router 元件，
// 只要「讀網址 → 哪個分頁、選哪一筆」和「改網址」兩件事。
// 每個分頁記得上次選的 id：從圖庫切回生成，會回到剛剛開著的專案。
import { useSyncExternalStore } from "react";

export const TABS = ["gen", "stickers", "styles", "characters", "gallery"] as const;
export type Tab = (typeof TABS)[number];
export type Route = { tab: Tab; id: string | null };

/** 「#/gen/s12」→ { tab: "gen", id: "s12" }；不認得的分頁當作 gen */
export function parseHash(hash: string): Route {
  const m = hash.match(/^#\/([^/?#]+)(?:\/([^/?#]+))?/);
  const tab = (TABS as readonly string[]).includes(m?.[1] ?? "") ? (m![1] as Tab) : "gen";
  return { tab, id: m?.[2] ? decodeURIComponent(m[2]) : null };
}

export const hrefOf = ({ tab, id }: Route) => `#/${tab}${id ? `/${encodeURIComponent(id)}` : ""}`;

// ---------- 目前的路由（給 useSyncExternalStore） ----------
const inBrowser = typeof window !== "undefined"; // 測試（node）裡沒有 window
let current: Route = parseHash(inBrowser ? location.hash : "");
/** 每個分頁上次選的 id */
const lastId: Partial<Record<Tab, string | null>> = { [current.tab]: current.id };
const listeners = new Set<() => void>();

function sync() {
  const next = parseHash(location.hash);
  if (next.tab === current.tab && next.id === current.id) return;
  current = next;
  lastId[next.tab] = next.id;
  listeners.forEach((f) => f());
}
if (inBrowser) window.addEventListener("hashchange", sync);

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

/** 換網址。id 沒給＝回到這個分頁上次選的那一筆；null＝不選（例如「新增」）。
 *  replace：不留瀏覽紀錄（自動選第一筆這種不是使用者按的） */
export function navigate(to: { tab: Tab; id?: string | null }, { replace = false } = {}) {
  const href = hrefOf({ tab: to.tab, id: to.id === undefined ? (lastId[to.tab] ?? null) : to.id });
  if (location.hash === href) return;
  if (replace) {
    history.replaceState(null, "", href);
    sync(); // replaceState 不會觸發 hashchange
  } else {
    location.hash = href;
  }
}

/** 在某個分頁選一筆：那個分頁正開著就改網址；在背景就只記住，切回去時才會出現在網址上
 *  （例如角色庫在背景載入完，自動選第一筆，不能把使用者從別的分頁拉過去） */
export function selectInTab(tab: Tab, id: string | null, { replace = false } = {}) {
  if (current.tab === tab) return navigate({ tab, id }, { replace });
  if ((lastId[tab] ?? null) === id) return;
  lastId[tab] = id;
  listeners.forEach((f) => f());
}

/** 目前的分頁與 id */
export const useRoute = () => useSyncExternalStore(subscribe, () => current);

/** 某個分頁目前（或上次）選的 id；分頁不在前景時也維持原本的選取 */
export const useTabId = (tab: Tab) => useSyncExternalStore(subscribe, () => lastId[tab] ?? null);

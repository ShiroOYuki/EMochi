// 網址路由（react-router 的 hash router）：#/<分頁>[/<id>]，例如 #/gen/s12、#/characters/c2、#/styles/st1
// 五個分頁都由 Layout（App.tsx）一直掛著，用 React 的 <Activity> 切換顯示：
// 隱藏的分頁保留輸入，但 effect 會暫停（不輪詢、不在背景改網址），切回來時 TanStack Query 自動重抓過期的資料。
// 路由表的子路由只負責比對網址、不渲染東西；這個檔案另外記住「每個分頁上次選的 id」，
// 從圖庫切回生成時，會回到剛剛開著的專案。
import type { ComponentType } from "react";
import { createHashRouter, redirect, useLocation, useNavigate, type NavigateOptions } from "react-router";

export const TABS = ["gen", "stickers", "styles", "characters", "gallery"] as const;
export type Tab = (typeof TABS)[number];
export type Route = { tab: Tab; id: string | null };
/** 網址上可以帶 id 的分頁 */
const WITH_ID: readonly Tab[] = ["gen", "styles", "characters"];

/** 「/gen/s12」→ { tab: "gen", id: "s12" }；不認得的分頁當作 gen */
export function parsePath(pathname: string): Route {
  const [, first = "", second] = pathname.split("/");
  const tab = (TABS as readonly string[]).includes(first) ? (first as Tab) : "gen";
  return { tab, id: second ? decodeURIComponent(second) : null };
}

export const pathOf = ({ tab, id }: Route) => `/${tab}${id ? `/${encodeURIComponent(id)}` : ""}`;

/** 每個分頁上次選的 id（網址只帶得了目前這一頁的） */
const lastId: Partial<Record<Tab, string | null>> = {};
const remember = (pathname: string) => {
  const r = parsePath(pathname);
  lastId[r.tab] = r.id;
};

/** 某個分頁的網址；id 沒給＝回到上次選的那一筆 */
export const tabPath = (tab: Tab, id?: string | null) =>
  pathOf({ tab, id: id === undefined ? (lastId[tab] ?? null) : id });

let router: ReturnType<typeof createHashRouter> | null = null;

/** main.tsx 呼叫一次；Layout 由外面傳進來，這個檔案才不用 import App（避免循環 import） */
export function createAppRouter(Layout: ComponentType) {
  router = createHashRouter([
    {
      path: "/",
      Component: Layout,
      children: [
        { index: true, loader: () => redirect("/gen") },
        ...TABS.map((t) => ({ path: WITH_ID.includes(t) ? `${t}/:id?` : t, element: null })),
        { path: "*", loader: () => redirect("/gen") },
      ],
    },
  ]);
  remember(router.state.location.pathname);
  router.subscribe((state) => remember(state.location.pathname)); // 比畫面更新早，頁面讀得到最新的
  return router;
}

/** React 元件以外的地方（通知點擊、垃圾桶還原、新手導覽）換頁用 */
export function goTo(tab: Tab, id?: string | null, opts?: NavigateOptions) {
  router?.navigate(tabPath(tab, id), opts);
}

/** 目前的分頁 */
export const useTab = (): Tab => parsePath(useLocation().pathname).tab;

/** 某個分頁目前（或上次）選的 id；分頁隱藏時維持原本的選取 */
export function useTabId(tab: Tab): string | null {
  const r = parsePath(useLocation().pathname);
  return r.tab === tab ? r.id : (lastId[tab] ?? null);
}

/** 在這個分頁選一筆（改網址）；replace：不留瀏覽紀錄（自動選第一筆這種） */
export function useSelect(tab: Tab) {
  const navigate = useNavigate();
  return (id: string | null, opts?: NavigateOptions) => navigate(pathOf({ tab, id }), opts);
}

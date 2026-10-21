// 伺服器狀態（TanStack Query）：哪些資料、用什麼 key 快取、什麼時候自動重抓
// 改了資料的操作成功後呼叫 invalidate(...) 讓看得到這份資料的畫面一起更新；
// 切換分頁時 App 會整批重抓（invalidateAll），所以頁面不用再各自寫「切回來就重抓」
import { QueryClient, useQuery } from "@tanstack/react-query";
import { galleryApi } from "./gallery";
import { charactersApi, styleLibApi, type RefLibraryApi } from "./library";
import { projectsApi } from "./projects";
import { codexApi, trashApi } from "./system";
import { BUSY, type TrashKind } from "./types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // 本機 API 很快；切回視窗時重抓一次，看得到在別處（另一個視窗、檔案總管）做的改變
      refetchOnWindowFocus: true,
    },
  },
});

export const keys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  characters: charactersApi.key,
  styleLib: styleLibApi.key,
  importable: ["style-lib-importable"] as const,
  gallery: ["gallery"] as const,
  trash: (kind: TrashKind) => ["trash", kind] as const,
  trashAll: ["trash"] as const,
  stickers: ["stickers"] as const,
  stickerGroups: ["sticker-groups"] as const,
  exportPresets: ["export-presets"] as const,
  codexUsage: ["codex", "usage"] as const,
  codexStatus: ["codex", "status"] as const,
  codexCheck: ["codex", "check"] as const,
};

/** 跳過後端快取重新讀一次，結果直接放進快取（重新整理、重新連線按鈕用）；minMs＝至少等這麼久，讓轉圈看得出來 */
export async function fetchFresh<T>(
  queryKey: readonly unknown[],
  fn: () => Promise<T>,
  minMs = 0,
): Promise<T> {
  const [data] = await Promise.all([fn(), new Promise((r) => setTimeout(r, minMs))]);
  queryClient.setQueryData(queryKey, data);
  return data;
}

/** 讓這些資料過期並重抓（畫面上有在用的才會真的發請求） */
export const invalidate = (...ks: readonly (readonly unknown[])[]) =>
  Promise.all(ks.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
export const invalidateAll = () => queryClient.invalidateQueries();

/** 執行中的專案每 2.5 秒輪詢 */
const POLL_MS = 2500;

/** 專案清單；poll＝目前開著的專案在執行中（清單上的狀態也要跟著變） */
export const useProjects = (poll = false) =>
  useQuery({ queryKey: keys.projects, queryFn: projectsApi.list, refetchInterval: poll ? POLL_MS : false });

/** 單一專案；執行中自動輪詢。換專案時 key 不同，舊專案晚到的回應不會蓋到新專案上 */
export const useProject = (id: string | null) =>
  useQuery({
    queryKey: keys.project(id ?? ""),
    queryFn: () => projectsApi.get(id!),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data && BUSY.includes(q.state.data.status) ? POLL_MS : false),
  });

export const useRefLibrary = <T>(api: RefLibraryApi<T>) => useQuery({ queryKey: api.key, queryFn: api.list });
export const useCharacters = () => useRefLibrary(charactersApi);
export const useStyleLib = () => useRefLibrary(styleLibApi);
export const useImportable = (enabled: boolean) =>
  useQuery({ queryKey: keys.importable, queryFn: styleLibApi.importable, enabled });

export const useGallery = () => useQuery({ queryKey: keys.gallery, queryFn: galleryApi.list });

/** 垃圾桶裡的東西；讀不到就當空的（垃圾桶數字不是重要資訊） */
export const useTrash = (kind: TrashKind) =>
  useQuery({ queryKey: keys.trash(kind), queryFn: () => trashApi.list(kind).catch(() => []) });

/** Navbar 的 Codex 額度：每 30 秒、切回視窗時重抓（額度資料只在 Codex 跑過後才會變） */
export const useCodexUsage = () =>
  useQuery({ queryKey: keys.codexUsage, queryFn: () => codexApi.usage(), refetchInterval: 30_000 });
export const refreshCodexUsage = (minMs = 0) =>
  fetchFresh(keys.codexUsage, () => codexApi.usage(true), minMs);

/** Codex 狀態對話框：開著的時候每 5 秒重抓 */
export const useCodexStatus = (open: boolean) =>
  useQuery({
    queryKey: keys.codexStatus,
    queryFn: () => codexApi.status(),
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });
export const refreshCodexStatus = (minMs = 0) =>
  fetchFresh(keys.codexStatus, () => codexApi.status(true), minMs);

/** 啟動時的 Codex 檢查（CLI、登入）；waitingLogin＝等瀏覽器登入中，每 3 秒跳過快取重查 */
export const useCodexCheck = (waitingLogin = false) =>
  useQuery({
    queryKey: keys.codexCheck,
    queryFn: () => codexApi.check(waitingLogin),
    refetchInterval: waitingLogin ? 3_000 : false,
    retry: false, // 伺服器沒回應就直接當作檢查不了（不擋使用者）
  });
export const refreshCodexCheck = (minMs = 0) =>
  fetchFresh(keys.codexCheck, () => codexApi.check(true), minMs);

import { Activity, type ReactNode } from "react";
import { useNavigate } from "react-router";
import ThemeToggle from "./components/ThemeToggle";
import CodexUsage from "./components/CodexUsage";
import { SettingsButton } from "./components/SettingsDialog";
import { WindowControls } from "./components/WindowControls";
import { UpdateBadge, useUpdateToast } from "./components/Updates";
import { SponsorButton } from "./components/Sponsor";
import CodexSetup from "./components/CodexSetup";
import { DisclaimerGate } from "./components/Disclaimer";
import Tour from "./components/Tour";
import { desktop } from "./desktop";
import { useNotifier } from "./notify";
import { Toaster, useApiErrorToasts } from "./toast";
import { tabPath, useTab, type Tab } from "./router";
import { ErrorBoundary, SPRING, TitleTooltips } from "./components/ui";
import { useReducedMotion } from "motion/react";
import {
  Tabs,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/primitives/radix/tabs";
import GenPage from "./pages/Gen";
import GalleryPage from "./pages/Gallery";
import CharactersPage from "./pages/Characters";
import StylesPage from "./pages/Styles";
import StickersPage from "./pages/Stickers";

const TABS: { id: Tab; label: string }[] = [
  { id: "gen", label: "生成" },
  { id: "stickers", label: "表情" },
  { id: "styles", label: "畫風" },
  { id: "characters", label: "角色" },
  { id: "gallery", label: "圖庫" },
];

/** 標誌：一對狐狸耳朵（白毛＋粉紅耳內） */
function Ears() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true">
      <path
        d="M2 21 L7 2 L14 15 Z"
        fill="var(--c-panel)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M6.5 15 L8 7 L11.5 13.5 Z" fill="#ff8db3" />
      <path
        d="M28 21 L23 2 L16 15 Z"
        fill="var(--c-panel)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M23.5 15 L22 7 L18.5 13.5 Z" fill="#ff8db3" />
    </svg>
  );
}

/** 一個分頁：用 <Activity> 切換顯示。隱藏時保留輸入與勾選，但 effect 暫停（不輪詢、不改網址）；
 *  顯示時 TanStack Query 重新訂閱，過期的資料自動重抓（可能剛在別的分頁改過） */
function Page({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <Activity mode={show ? "visible" : "hidden"}>
      <div className="h-full">
        <ErrorBoundary resetKey={show}>{children}</ErrorBoundary>
      </div>
    </Activity>
  );
}

/** 整個 App 的外框（react-router 的 Layout route，router.ts）：Navbar＋五個分頁 */
export default function App() {
  const tab = useTab();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  useNotifier();
  useApiErrorToasts();
  useUpdateToast();
  /** 切分頁：回到那一頁上次選的那一筆 */
  const go = (t: Tab) => navigate(tabPath(t));

  return (
    <div className="flex h-full flex-col">
      {/* 桌面版：Navbar 兼當標題列（空白處可拖曳視窗、雙擊最大化），右邊多一組視窗按鈕 */}
      <header
        className={`flex items-center gap-4 bg-panel py-3 pl-5 shadow-[0_6px_20px_-12px_rgb(52_49_90/0.25)] ${desktop ? "app-drag pr-3" : "pr-5"}`}
      >
        <h1 className="flex items-center gap-2 text-lg">
          <Ears />
          EMochi
        </h1>
        {/* Animate UI Tabs：藍色軟糖底用彈簧滑到目前的分頁；方向鍵可切換 */}
        <Tabs value={tab} onValueChange={(v) => go(v as Tab)} asChild>
          <nav>
            <TabsHighlight
              className="absolute inset-0 z-0 rounded-full bg-acc shadow-[0_2px_0_var(--color-acc-deep)]"
              transition={reduce ? { duration: 0 } : SPRING}
            >
              <TabsList className="flex rounded-full bg-panel2 p-1" aria-label="分頁">
                {TABS.map((t) => (
                  <TabsHighlightItem key={t.id} value={t.id}>
                    <TabsTrigger
                      value={t.id}
                      data-tour={`tab-${t.id}`}
                      className="relative z-[1] rounded-full px-5 py-1.5 text-sm text-mute outline-none transition-colors hover:text-text focus-visible:ring-3 focus-visible:ring-acc/40 data-[state=active]:text-on-acc data-[state=active]:hover:text-on-acc"
                    >
                      {t.label}
                    </TabsTrigger>
                  </TabsHighlightItem>
                ))}
              </TabsList>
            </TabsHighlight>
          </nav>
        </Tabs>
        <div className="ml-auto" />
        <UpdateBadge />
        <CodexUsage />
        <ThemeToggle />
        <SponsorButton />
        <SettingsButton />
        <WindowControls />
      </header>
      <main className="min-h-0 flex-1">
        <Page show={tab === "gen"}>
          <GenPage onOpenGallery={() => go("gallery")} />
        </Page>
        <Page show={tab === "stickers"}>
          <StickersPage />
        </Page>
        <Page show={tab === "styles"}>
          <StylesPage />
        </Page>
        <Page show={tab === "characters"}>
          <CharactersPage />
        </Page>
        <Page show={tab === "gallery"}>
          <GalleryPage />
        </Page>
      </main>
      <DisclaimerGate />
      <CodexSetup />
      <Tour />
      <TitleTooltips />
      <Toaster />
    </div>
  );
}

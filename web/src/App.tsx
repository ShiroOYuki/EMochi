import { useEffect, useState } from "react";
import ThemeToggle from "./components/ThemeToggle";
import CodexUsage from "./components/CodexUsage";
import { ErrorBoundary } from "./components/ui";
import GenPage from "./pages/Gen";
import GalleryPage from "./pages/Gallery";
import CharactersPage from "./pages/Characters";
import StylesPage from "./pages/Styles";

type Tab = "gen" | "styles" | "characters" | "gallery";
const TABS: { id: Tab; label: string }[] = [
  { id: "gen", label: "Gen 生成" }, { id: "styles", label: "畫風" }, { id: "characters", label: "角色" }, { id: "gallery", label: "Gallery 圖庫" },
];
const readTab = (): Tab => TABS.find((t) => location.hash.startsWith(`#/${t.id}`))?.id ?? "gen";

/** 標誌：一對狐狸耳朵（白毛＋粉紅耳內） */
function Ears() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true">
      <path d="M2 21 L7 2 L14 15 Z" fill="var(--c-panel)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6.5 15 L8 7 L11.5 13.5 Z" fill="#ff8db3" />
      <path d="M28 21 L23 2 L16 15 Z" fill="var(--c-panel)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M23.5 15 L22 7 L18.5 13.5 Z" fill="#ff8db3" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab);
  useEffect(() => {
    const on = () => setTab(readTab());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (t: Tab) => { location.hash = `#/${t}`; };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 bg-panel px-5 py-3 shadow-[0_6px_20px_-12px_rgb(52_49_90/0.25)]">
        <h1 className="flex items-center gap-2 text-lg"><Ears />AI Sticker</h1>
        <nav className="flex rounded-full bg-panel2 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)}
            className={`rounded-full px-5 py-1.5 text-sm transition ${tab === t.id ? "bg-acc text-on-acc shadow-[0_2px_0_var(--color-acc-deep)]" : "text-mute hover:text-text"}`}>
            {t.label}
          </button>
        ))}
        </nav>
        <CodexUsage className="ml-auto" />
        <ThemeToggle />
      </header>
      <main className="min-h-0 flex-1">
        {/* 兩頁都保留在 DOM，切換分頁不會丟失輸入與勾選 */}
        <div className={tab === "gen" ? "h-full" : "hidden"}><ErrorBoundary resetKey={tab}><GenPage onOpenGallery={() => go("gallery")} active={tab === "gen"} /></ErrorBoundary></div>
        <div className={tab === "styles" ? "h-full" : "hidden"}><ErrorBoundary resetKey={tab}><StylesPage active={tab === "styles"} /></ErrorBoundary></div>
        <div className={tab === "characters" ? "h-full" : "hidden"}><ErrorBoundary resetKey={tab}><CharactersPage active={tab === "characters"} /></ErrorBoundary></div>
        <div className={tab === "gallery" ? "h-full" : "hidden"}><ErrorBoundary resetKey={tab}><GalleryPage active={tab === "gallery"} /></ErrorBoundary></div>
      </main>
    </div>
  );
}

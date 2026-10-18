import { useEffect, useState } from "react";
import GenPage from "./pages/Gen";
import GalleryPage from "./pages/Gallery";

type Tab = "gen" | "gallery";
const readTab = (): Tab => (location.hash.startsWith("#/gallery") ? "gallery" : "gen");

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
      <header className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <h1 className="mr-4 text-base font-semibold">AI Sticker</h1>
        {(["gen", "gallery"] as Tab[]).map((t) => (
          <button key={t} onClick={() => go(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === t ? "bg-sel text-white" : "text-mute hover:bg-[#383a40] hover:text-text"}`}>
            {t === "gen" ? "Gen 生成" : "Gallery 圖庫"}
          </button>
        ))}
      </header>
      <main className="min-h-0 flex-1">
        {/* 兩頁都保留在 DOM，切換分頁不會丟失輸入與勾選 */}
        <div className={tab === "gen" ? "h-full" : "hidden"}><GenPage onOpenGallery={() => go("gallery")} /></div>
        <div className={tab === "gallery" ? "h-full" : "hidden"}><GalleryPage active={tab === "gallery"} /></div>
      </main>
    </div>
  );
}

import { useState } from "react";
// 打包時把 repo 根目錄的授權檔原文一起放進前端（?raw＝當成字串匯入），離線也看得到
import gpl from "../../../LICENSE?raw";
import assets from "../../../ASSETS-LICENSE.md?raw";
import { Modal } from "./ui";

type Tab = "code" | "assets";
const TABS: { id: Tab; label: string; note: string; text: string }[] = [
  {
    id: "code",
    label: "程式碼（GPL-3.0）",
    note: "EMochi 的程式碼採用 GNU General Public License v3.0 或更新版本：可以自由使用、修改、散布（含商用），散布修改版時必須同樣以 GPL 開放原始碼。",
    text: gpl,
  },
  {
    id: "assets",
    label: "內建素材",
    note: "內建範例畫風的角色圖、內建表情 #1～32 的範例圖不在 GPL 範圍內。",
    text: assets.replace(/\*\*/g, ""), // Markdown 粗體記號拿掉，純文字比較好讀
  },
];

/** 設定頁「關於 → 授權」：顯示 LICENSE（GPL-3.0 全文）與 ASSETS-LICENSE（內建素材） */
export function LicenseButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("code");
  const cur = TABS.find((t) => t.id === tab)!;
  return (
    <>
      <button
        className="btn btn-sm"
        onClick={() => {
          setTab("code");
          setOpen(true);
        }}
      >
        查看授權條款
      </button>
      <Modal open={open} onClose={() => setOpen(false)} label="授權條款">
        <h3 className="mb-3 text-lg">授權條款</h3>
        <div className="mb-3 flex gap-1.5" role="tablist" aria-label="授權類別">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full border-2 px-3 py-0.5 text-xs transition ${tab === t.id ? "border-pink bg-pink-soft" : "border-line text-mute hover:border-acc"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs text-mute">{cur.note}</p>
        <pre
          role="tabpanel"
          className="max-h-[55vh] overflow-auto rounded-xl bg-panel2 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
        >
          {cur.text}
        </pre>
        <div className="mt-4 flex justify-end">
          <button className="btn" onClick={() => setOpen(false)}>
            關閉
          </button>
        </div>
      </Modal>
    </>
  );
}

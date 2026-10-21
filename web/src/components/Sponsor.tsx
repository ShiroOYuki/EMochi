/** 贊助入口：Navbar 的愛心按鈕、設定頁「說明 → 支持開發」
 *  連結都是一般外部連結：網頁版開新分頁，桌面版由 Electron 的 setWindowOpenHandler 交給預設瀏覽器 */
import { useState } from "react";
import { Modal } from "./ui";

type Sponsor = { id: string; name: string; url: string; note: string };
/** url 留空的平台不顯示（例如還沒申請好的） */
const SPONSORS: Sponsor[] = [
  { id: "ecpay", name: "綠界", url: "https://p.ecpay.com.tw/C487EF9", note: "台灣在地付款（新台幣）" },
  { id: "kofi", name: "Ko-fi", url: "https://ko-fi.com/ciel518", note: "國際：信用卡、PayPal" },
].filter((s) => s.url);

function Heart({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.6 0 5.5 3.7 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" />
    </svg>
  );
}

/** 各平台的連結按鈕（對話框和設定頁共用） */
export function SponsorLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      {SPONSORS.map((s) => (
        <a
          key={s.id}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm gap-1.5"
          title={s.note}
        >
          <span className="text-pink">
            <Heart size={13} />
          </span>
          {s.name}
          <span className="text-[11px] text-mute">{s.note}</span>
        </a>
      ))}
    </div>
  );
}

/** Navbar 的愛心按鈕：點開小對話框說明，再選平台 */
export function SponsorButton() {
  const [open, setOpen] = useState(false);
  if (!SPONSORS.length) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="支持 EMochi"
        title="支持 EMochi"
        className="btn px-2.5 text-pink"
      >
        <Heart />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} label="支持 EMochi">
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-lg">
            <span className="text-pink">
              <Heart size={18} />
            </span>
            支持 EMochi
          </h3>
          <div className="space-y-2 text-sm leading-relaxed">
            <p>EMochi 是免費、開源的個人專案，所有功能都可以直接使用，不贊助也完全沒關係。</p>
            <p>如果它幫你省了時間、做出喜歡的貼圖，歡迎請我喝杯咖啡，支持之後的新功能和維護 ☕</p>
          </div>
          <SponsorLinks />
          <p className="text-[11px] text-mute">會在瀏覽器開啟付款頁面；EMochi 不會收集任何付款資料。</p>
          <div className="flex justify-end">
            <button className="btn" onClick={() => setOpen(false)}>
              關閉
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export const hasSponsors = SPONSORS.length > 0;

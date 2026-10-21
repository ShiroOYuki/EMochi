import { useEffect, useState, useSyncExternalStore } from "react";
import { uiPrefsApi } from "../api";
import { Modal } from "./ui";

/** 免責聲明的版本：內容有實質修改時加 1，已經同意過舊版的人下次開 App 會再看到一次 */
export const DISCLAIMER_VERSION = 1;

const ITEMS: { title: string; body: string }[] = [
  {
    title: "非官方工具",
    body: "EMochi 是個人開發的開源工具，與 OpenAI、Twitch、Discord、LINE、YouTube、Kick、Telegram、Slack 等公司或平台沒有隸屬、合作或背書關係；提到的名稱與商標屬於各自的擁有者。",
  },
  {
    title: "生成內容由你負責",
    body: "貼圖由 OpenAI Codex 依你提供的角色圖、畫風和描述生成。請自行確認上傳的參考圖與生成結果有權使用（著作權、肖像權等），並符合各平台的貼圖規範與 OpenAI 的使用條款；使用、上架或散布生成內容所產生的爭議，由使用者自行負責。",
  },
  {
    title: "內建範例圖只供示範",
    body: "內建表情 #1～32 的範例圖、範例畫風的角色圖只用來示範與分析表情、畫風，著作權屬於作者。請勿把這些圖片本身當成你的貼圖上架、販售或另作他用（詳見 ASSETS-LICENSE.md）。",
  },
  {
    title: "按現狀提供",
    body: "本軟體按「現狀」提供，不附任何明示或默示的擔保。生圖會消耗你的 ChatGPT／Codex 額度；作者不對額度消耗、生成結果、資料遺失或其他因使用本軟體造成的損失負責。",
  },
];

export function DisclaimerText() {
  return (
    <ol className="space-y-3 text-sm">
      {ITEMS.map((x, i) => (
        <li key={x.title} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-panel2 text-xs text-mute">
            {i + 1}
          </span>
          <div>
            <p className="mb-0.5">{x.title}</p>
            <p className="text-xs leading-relaxed text-mute">{x.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- 第一次開 App：同意之前不往下走（Codex 準備視窗、新手導覽都排在後面） ---------- */
export type DisclaimerState = "checking" | "open" | "ok";
let state: DisclaimerState = "checking";
const subs = new Set<() => void>();
const set = (s: DisclaimerState) => {
  state = s;
  subs.forEach((f) => f());
};
export const useDisclaimerState = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );

/** App 掛一次：沒同意過（或同意的是舊版）就跳出來，要按「我了解並同意」才能繼續；按 Esc、點外面都不會關 */
export function DisclaimerGate() {
  const s = useDisclaimerState();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state !== "checking") return;
    uiPrefsApi
      .get()
      .then((r) => set((r.disclaimer ?? 0) >= DISCLAIMER_VERSION ? "ok" : "open"))
      .catch(() => set("ok")); // 伺服器沒回應：不擋（其他地方會顯示錯誤）
  }, []);
  const agree = async () => {
    setBusy(true);
    try {
      await uiPrefsApi.set({ disclaimer: DISCLAIMER_VERSION });
    } catch {
      /* 存不了就下次開 App 再問 */
    }
    set("ok");
  };
  return (
    <Modal open={s === "open"} onClose={() => {}} label="免責聲明">
      <h3 className="mb-1 text-lg">開始使用前，請先閱讀</h3>
      <p className="mb-4 text-xs text-mute">之後也可以在「設定 → 關於 → 免責聲明」再看一次。</p>
      <DisclaimerText />
      <div className="mt-5 flex justify-end">
        <button className="btn btn-primary" onClick={agree} disabled={busy}>
          我了解並同意
        </button>
      </div>
    </Modal>
  );
}

/** 設定頁「關於」：再看一次 */
export function DisclaimerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        查看免責聲明
      </button>
      <Modal open={open} onClose={() => setOpen(false)} label="免責聲明">
        <h3 className="mb-4 text-lg">免責聲明</h3>
        <DisclaimerText />
        <div className="mt-5 flex justify-end">
          <button className="btn" onClick={() => setOpen(false)}>
            關閉
          </button>
        </div>
      </Modal>
    </>
  );
}

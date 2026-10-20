import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../api";
import { SPRING } from "./ui";
import { useCodexGate } from "./CodexSetup";

/** 新手導覽：依序框出真實介面元素（data-tour="…"），其他區域變暗，每步一段說明。
 *  第一次開 App（settings.local.json 沒有 tour_done）且 Codex 準備視窗處理完後自動開始；
 *  略過或看完都記成看過；設定頁「說明」可以重看 */
type Step = { target?: string[]; tab?: string; title: string; body: string };
const STEPS: Step[] = [
  {
    title: "歡迎使用 EMochi",
    body: "EMochi 幫你把角色做成一整套表情貼圖：準備角色和畫風 → 生成 → 挑選 → 匯出各平台尺寸。花一分鐘帶你認識介面。",
  },
  {
    target: ["gen-new", "gen-main"],
    tab: "gen",
    title: "生成",
    body: "選角色和畫風，用中文描述想要的感覺。Codex 會先擴寫成畫風描述、出一張 2×2 風格預覽，確認後再挑表情批次生成（預設 4×2，每組 8 張），自動切割、去背。",
  },
  {
    target: ["tab-stickers"],
    tab: "stickers",
    title: "表情",
    body: "要畫哪些表情：內建 #1～32，可以自己新增、修改，也能分組。",
  },
  {
    target: ["tab-styles"],
    tab: "styles",
    title: "畫風",
    body: "存放畫風的範例圖和描述。已經內建一組範例畫風 st1，可以先拿來試。",
  },
  {
    target: ["tab-characters"],
    tab: "characters",
    title: "角色",
    body: "上傳角色的參考圖，Codex 會看圖幫你寫角色特徵。存好之後，每次生成直接選。",
  },
  {
    target: ["tab-gallery"],
    tab: "gallery",
    title: "圖庫",
    body: "勾選滿意的貼圖，用匯出預設集一次輸出 Twitch、Discord、LINE 等平台尺寸的 ZIP。",
  },
  {
    target: ["codex"],
    title: "Codex 額度",
    body: "生圖用的是你 ChatGPT 帳號的 Codex 額度，每張網格大約 35K tokens。點這裡看連線狀態、額度和近 7 天用量。",
  },
  {
    target: ["settings"],
    title: "設定",
    body: "資料夾位置、同時生圖組數、匯出預設集都在這裡；想再看一次導覽也在這裡。",
  },
];
const PAD = 6;
const GAP = 12;
const CARD_W = 340;
const MARGIN = 12;

/* ---------- 開始／結束 ---------- */
let running = false;
const subs = new Set<() => void>();
const setRunning = (v: boolean) => {
  running = v;
  subs.forEach((f) => f());
};
export const startTour = () => setRunning(true);
const useRunning = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => running,
  );

type Box = { x: number; y: number; w: number; h: number; r: number };
const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.r === b.r);

function measure(ids?: string[]): Box | null {
  for (const id of ids ?? []) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${id}"]`);
    if (!el) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue; // 在隱藏的分頁裡
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, b.height / 2);
    return {
      x: Math.round(b.left - PAD),
      y: Math.round(b.top - PAD),
      w: Math.round(b.width + PAD * 2),
      h: Math.round(b.height + PAD * 2),
      r: r + PAD,
    };
  }
  return null;
}

/** 說明卡放在目標下方；下方放不下改上方，再不行放右邊、左邊，都不行就疊在目標裡面靠下 */
function place(box: Box | null, cw: number, ch: number): { x: number; y: number } {
  const W = innerWidth,
    H = innerHeight;
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), W - cw - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), H - ch - MARGIN);
  if (!box) return { x: (W - cw) / 2, y: (H - ch) / 2 };
  const cx = clampX(box.x + box.w / 2 - cw / 2);
  if (box.y + box.h + GAP + ch <= H - MARGIN) return { x: cx, y: box.y + box.h + GAP };
  if (box.y - GAP - ch >= MARGIN) return { x: cx, y: box.y - GAP - ch };
  const cy = clampY(box.y + box.h / 2 - ch / 2);
  if (box.x + box.w + GAP + cw <= W - MARGIN) return { x: box.x + box.w + GAP, y: cy };
  if (box.x - GAP - cw >= MARGIN) return { x: box.x - GAP - cw, y: cy };
  return { x: cx, y: clampY(box.y + box.h - ch - 24) };
}

const markDone = () =>
  api.put("/api/ui-prefs", { tour_done: true }).catch(() => {
    /* 存不了下次再跳 */
  });

/** 掛在 App 上 */
export default function Tour() {
  const on = useRunning();
  const gate = useCodexGate();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: CARD_W, h: 180 });
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const backTo = useRef("");
  const checked = useRef(false);

  // 第一次開 App：等 Codex 準備視窗處理完再開始
  useEffect(() => {
    if (gate !== "done" || checked.current) return;
    checked.current = true;
    api
      .get<{ tour_done?: boolean }>("/api/ui-prefs")
      .then((r) => {
        if (!r.tour_done) startTour();
      })
      .catch(() => {
        /* 伺服器沒回應就不跳 */
      });
  }, [gate]);

  // 開始時記住原本的分頁，結束後還原
  useEffect(() => {
    if (!on) return;
    backTo.current = location.hash || "#/gen";
    setI(0);
  }, [on]);

  const step = STEPS[i];
  useEffect(() => {
    if (on && step.tab && !location.hash.startsWith(`#/${step.tab}`)) location.hash = `#/${step.tab}`;
  }, [on, step]);

  // 跟著目標的位置（換分頁、捲動、視窗縮放、版面還在載入都會變）
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last: Box | null = null;
    const tick = () => {
      const b = measure(step.target);
      if (!sameBox(b, last)) {
        last = b;
        setBox(b);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [on, step]);

  useLayoutEffect(() => {
    const el = card.current;
    if (!on || !el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);

  useEffect(() => {
    if (on) primary.current?.focus({ preventScroll: true });
  }, [on, i]);

  const finish = useCallback(() => {
    setRunning(false);
    markDone();
    if (backTo.current && location.hash !== backTo.current) location.hash = backTo.current;
  }, []);
  const next = useCallback(() => {
    if (i >= STEPS.length - 1) finish();
    else setI(i + 1);
  }, [i, finish]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Tab") {
        // 焦點留在說明卡裡
        const els = card.current?.querySelectorAll<HTMLElement>("button");
        if (!els?.length) return;
        const first = els[0],
          lastEl = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        } else if (!card.current?.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [on, next, prev, finish]);

  if (!on) return null;
  const pos = place(box, size.w, size.h);
  const move = reduce ? { duration: 0 } : SPRING;
  const last = i === STEPS.length - 1;

  return (
    <div className="no-drag fixed inset-0 z-[60]" aria-hidden={false}>
      {/* 擋住底下的點擊；變暗的部分由聚光框的大陰影負責 */}
      <div
        className="absolute inset-0"
        onClick={(e) => e.stopPropagation()}
        style={box ? undefined : { background: "rgb(29 27 46 / 0.55)" }}
      />
      {box && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 ring-2 ring-acc/80"
          initial={false}
          animate={{ x: box.x, y: box.y, width: box.w, height: box.h, borderRadius: box.r }}
          transition={move}
          style={{ boxShadow: "0 0 0 9999px rgb(29 27 46 / 0.55)" }}
        />
      )}
      <motion.div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute top-0 left-0 rounded-[22px] bg-panel p-5 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.5)] ring-2 ring-acc/35 outline-none"
        style={{ width: `min(${CARD_W}px, calc(100vw - ${MARGIN * 2}px))` }}
        initial={false}
        animate={{ x: pos.x, y: pos.y }}
        transition={move}
      >
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs tabular-nums text-gold">
            {i + 1} / {STEPS.length}
          </span>
          <h3 id="tour-title" className="text-base">
            {step.title}
          </h3>
        </div>
        <p id="tour-body" className="text-sm leading-relaxed text-mute">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button className="btn btn-sm" onClick={finish}>
              略過
            </button>
          )}
          <div className="mx-auto flex gap-1" aria-hidden>
            {STEPS.map((_, k) => (
              <span key={k} className={`size-1.5 rounded-full ${k === i ? "bg-acc" : "bg-line"}`} />
            ))}
          </div>
          {i > 0 && (
            <button className="btn btn-sm" onClick={prev}>
              上一步
            </button>
          )}
          <button ref={primary} className="btn btn-sm btn-primary" onClick={next}>
            {i === 0 ? "開始" : last ? "完成" : "下一步"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { codexApi, refreshCodexCheck, useCodexCheck } from "../api";
import { Modal, Spinner } from "./ui";
import { copyText } from "../lib/clipboard";
import { useDisclaimerState } from "./Disclaimer";

const PS_INSTALL = `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"`;
const NPM_INSTALL = "npm install -g @openai/codex";
const DISMISS_KEY = "codexSetup.dismissed"; // 這次開 App 按過「稍後再說」就不再自動跳（下次開 App 還是會檢查）

/* ---------- 啟動流程的狀態：新手導覽要等這個視窗處理完才開始 ---------- */
export type CodexGate = "checking" | "open" | "done";
let gate: CodexGate = "checking";
const subs = new Set<() => void>();
const setGate = (g: CodexGate) => {
  gate = g;
  subs.forEach((f) => f());
};
export const useCodexGate = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => gate,
  );
/** 從其他地方（Codex 狀態對話框）打開安裝說明 */
export const openCodexSetup = () => setGate("open");

const dismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

/** 掛在 App 上：啟動時查一次 Codex，找不到 CLI 或沒登入就跳出準備視窗 */
export default function CodexSetup() {
  const g = useCodexGate();
  const open = g === "open";
  // 等瀏覽器登入（後端回報 login.pending）時每 3 秒跳過快取重查，登入完成就會變成「準備好了」
  const [waitingLogin, setWaitingLogin] = useState(false);
  const { data, isFetched } = useCodexCheck(open && waitingLogin);
  const c = data ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // 啟動時第一次查完：找不到 CLI 或沒登入（且這次開 App 沒按過「稍後再說」）就打開；
  // 伺服器沒回應時（isFetched 但沒有 data）不擋，其他地方會顯示錯誤
  // 第一次開 App 要先同意免責聲明（Disclaimer.tsx），同意後才輪到這個視窗
  const disclaimer = useDisclaimerState();
  useEffect(() => {
    if (gate !== "checking" || !isFetched || disclaimer !== "ok") return;
    setGate(c && (!c.cli.found || !c.login.ok) && !dismissed() ? "open" : "done");
  }, [isFetched, c, disclaimer]);
  const pending = !!c?.login.pending;
  useEffect(() => setWaitingLogin(pending), [pending]);
  // 打開時跳過快取重查一次（從 Codex 狀態對話框進來時資料可能是舊的）
  useEffect(() => {
    if (open) refreshCodexCheck().catch(() => {});
  }, [open]);

  const recheck = async () => {
    setBusy(true);
    setNote("");
    const x = await refreshCodexCheck(500).catch(() => null);
    setBusy(false);
    if (x && !x.cli.found)
      setNote(
        "還是找不到 Codex CLI。剛裝好的話，請關掉 EMochi 再重新開啟；npm 安裝的請確認 npm 的全域資料夾在 PATH 裡。",
      );
  };
  const login = async () => {
    setNote("");
    try {
      setNote(await codexApi.login());
      refreshCodexCheck().catch(() => {}); // 拿到 login.pending 就會開始每 3 秒重查
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const close = () => {
    if (c && (!c.cli.found || !c.login.ok)) {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* 忽略 */
      }
    }
    setNote("");
    setGate("done");
  };

  const cliOk = !!c?.cli.found;
  const loginOk = cliOk && !!c?.login.ok;
  const ready = cliOk && loginOk;

  return (
    <Modal open={open} onClose={close} label="準備 Codex CLI">
      <div className="space-y-5">
        <div>
          <h3 className="text-lg">{ready ? "Codex 準備好了" : "先準備好 Codex CLI"}</h3>
          <p className="mt-1 text-sm text-mute">
            EMochi 透過 OpenAI 的 Codex CLI 生圖、擴寫描述，用的是
            <b className="font-normal text-text">你自己 ChatGPT 帳號的 Codex 額度</b>
            （Plus、Pro、Business、Edu、Enterprise 等方案）。沒有 Codex
            也能管理表情、角色、畫風和匯出，只是不能生圖。
          </p>
        </div>

        {!c && (
          <div className="flex items-center gap-2 text-sm text-mute">
            <Spinner className="size-3.5" />
            檢查中…
          </div>
        )}
        {c && (
          <ol className="space-y-3">
            <Step
              n={1}
              done={cliOk}
              title="安裝 Codex CLI"
              status={cliOk ? `已安裝 ${c.cli.version ?? ""}`.trim() : "找不到"}
            >
              {!cliOk && (
                <>
                  <p>開啟 PowerShell，貼上這行執行（不需要 Node.js）：</p>
                  <Cmd text={PS_INSTALL} />
                  <p>已經有 Node.js 的話，也可以用 npm 安裝：</p>
                  <Cmd text={NPM_INSTALL} />
                  <p>
                    其他安裝方式見{" "}
                    <a
                      className="text-acc hover:underline"
                      href="https://github.com/openai/codex"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Codex CLI 官方說明
                    </a>
                    。
                  </p>
                </>
              )}
              {cliOk && c.cli.path && (
                <p className="truncate" title={c.cli.path}>
                  {c.cli.path}
                </p>
              )}
            </Step>
            <Step
              n={2}
              done={loginOk}
              title="用 ChatGPT 帳號登入"
              status={
                !cliOk
                  ? "先完成第 1 步"
                  : loginOk
                    ? c.login.text || "已登入"
                    : c.login.pending
                      ? "等待瀏覽器登入…"
                      : "未登入"
              }
            >
              {cliOk && !loginOk && (
                <>
                  <p>
                    按下面的按鈕會打開瀏覽器，選 <b className="font-normal text-text">Sign in with ChatGPT</b>{" "}
                    登入；完成後這裡會自動更新。也可以在終端機執行{" "}
                    <code className="rounded bg-panel px-1 whitespace-nowrap">codex login</code>。
                  </p>
                  <button className="btn btn-sm btn-primary" onClick={login} disabled={c.login.pending}>
                    {c.login.pending ? (
                      <>
                        <Spinner className="size-3" />
                        等待登入…
                      </>
                    ) : (
                      "用 ChatGPT 登入"
                    )}
                  </button>
                </>
              )}
            </Step>
            <Step n={3} done title="沙盒設定" status="自動">
              <p>
                EMochi 呼叫 Codex 時會自動加上{" "}
                <code className="rounded bg-panel px-1 whitespace-nowrap">--enable prefer_mxc</code>（Windows
                的 MXC 沙盒；不支援的電腦會自動退回舊模式），不用另外設定，也不會改你的{" "}
                <code className="rounded bg-panel px-1 whitespace-nowrap">~/.codex/config.toml</code>。
              </p>
            </Step>
          </ol>
        )}

        {note && <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-text">{note}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!ready && <span className="mr-auto text-xs text-mute">裝好或登入後按「重新檢查」</span>}
          {ready ? (
            <button className="btn btn-primary" onClick={close} autoFocus>
              開始使用
            </button>
          ) : (
            <>
              <button className="btn" onClick={close}>
                稍後再說
              </button>
              <button className="btn btn-primary" onClick={recheck} disabled={busy || !c}>
                {busy ? (
                  <>
                    <Spinner className="size-3.5" />
                    檢查中…
                  </>
                ) : (
                  "重新檢查"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Step({
  n,
  done,
  title,
  status,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  status: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-2xl bg-panel2 p-4">
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${done ? "bg-ok text-white" : "bg-panel text-mute"}`}
      >
        {done ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          n
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-xs text-mute">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-sm text-text">{title}</h4>
          <span className={done ? "text-ok" : "text-warn"}>{status}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

/** 指令＋複製按鈕 */
function Cmd({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-panel py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] whitespace-nowrap text-text">
        {text}
      </code>
      <button
        className="btn btn-sm shrink-0"
        onClick={() => {
          copyText(text);
          setCopied(true);
          clearTimeout(t.current);
          t.current = window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "✓ 已複製" : "複製"}
      </button>
    </div>
  );
}

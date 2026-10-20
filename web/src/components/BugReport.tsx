import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { desktop } from "../desktop";
import { copyText } from "./manage";

/** 回報問題：GitHub Issues 或 Email 兩個管道。按下時先把診斷資訊複製到剪貼簿，
 *  網址只帶版本、系統、Codex 狀態（不帶 log、不帶路徑）；不會自動上傳任何檔案 */
export const REPO_URL = "https://github.com/ShiroOYuki/EMochi";
export const REPORT_EMAIL = "cielwork518@gmail.com";

type Diag = { version: string; os: string; codex: string; mode: string; text: string };

const fetchDiag = () =>
  api.get<Diag>(
    `/api/diagnostics?desktop=${desktop ? 1 : 0}${desktop ? `&app_version=${encodeURIComponent(desktop.version)}` : ""}`,
  );

export function issueUrl(d: Diag) {
  const q = new URLSearchParams({
    template: "bug_report.yml",
    version: `v${d.version}（${d.mode}）`,
    os: d.os,
    codex: d.codex,
  });
  return `${REPO_URL}/issues/new?${q}`;
}

export function mailUrl(d: Diag) {
  const body = [
    "發生了什麼事：",
    "",
    "",
    "怎麼重現（做了哪些步驟）：",
    "",
    "",
    "預期的結果：",
    "",
    "",
    "（有截圖或 log 可以直接附在信裡）",
    "",
    "---- 診斷資訊 ----",
    d.text,
  ].join("\n");
  // 換行用 CRLF（RFC 6068）；encodeURIComponent 的空白是 %20，郵件程式不會誤當成 +
  const enc = (s: string) => encodeURIComponent(s).replace(/%0A/g, "%0D%0A");
  return `mailto:${REPORT_EMAIL}?subject=${enc(`[EMochi v${d.version}] 問題回報`)}&body=${enc(body)}`;
}

export function ReportSection() {
  const [d, setD] = useState<Diag | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const t = useRef(0);
  useEffect(() => () => clearTimeout(t.current), []);
  useEffect(() => {
    fetchDiag()
      .then(setD)
      .catch((e) => setErr((e as Error).message));
  }, []);
  const flash = (s: string) => {
    setNote(s);
    clearTimeout(t.current);
    t.current = window.setTimeout(() => setNote(""), 4000);
  };

  /** 每次按都重新取一次（Codex 狀態可能剛變） */
  const fresh = async () => {
    try {
      const x = await fetchDiag();
      setD(x);
      return x;
    } catch (e) {
      setErr((e as Error).message);
      return d;
    }
  };
  const github = async () => {
    // 先開視窗（瀏覽器要求在點擊當下開，否則會被擋），內容取得後再導向
    const w = desktop ? null : window.open("about:blank", "_blank");
    const x = await fresh();
    if (!x) {
      w?.close();
      return;
    }
    copyText(x.text);
    const url = issueUrl(x);
    if (w) w.location.href = url;
    else window.open(url, "_blank");
    flash("已開啟 GitHub，診斷資訊已複製，貼到「診斷資訊」欄即可（需要 GitHub 帳號）");
  };
  const mail = async () => {
    const x = await fresh();
    if (!x) return;
    copyText(x.text);
    location.href = mailUrl(x); // 導向 mailto 不會離開頁面；桌面版由 will-navigate 交給預設郵件程式
    flash(`已用預設郵件程式開新信；沒有反應的話，請直接寄到 ${REPORT_EMAIL}（診斷資訊已複製）`);
  };
  const copy = async () => {
    const x = await fresh();
    if (x) {
      copyText(x.text);
      flash("診斷資訊已複製");
    }
  };
  const openCodexLogs = async () => {
    try {
      const { path } = await api.get<{ path: string }>("/api/logs-dir");
      await api.post("/api/settings/open-folder", { path });
    } catch (e) {
      flash((e as Error).message);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" onClick={github}>
          在 GitHub 回報
        </button>
        <button className="btn btn-sm" onClick={mail}>
          用 Email 回報
        </button>
        <button className="btn btn-sm" onClick={copy}>
          複製診斷資訊
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={openCodexLogs}>
          開啟 Codex log 資料夾
        </button>
        {desktop?.openLogs && (
          <button className="btn btn-sm" onClick={() => desktop?.openLogs?.()}>
            開啟程式 log 資料夾
          </button>
        )}
      </div>
      {note && (
        <p className="text-[11px] text-acc" role="status">
          {note}
        </p>
      )}
      {err && <p className="text-[11px] text-bad">讀不到診斷資訊：{err}</p>}
      <p className="text-[11px] text-mute">
        Email：
        <button
          className="text-acc hover:underline"
          onClick={() => {
            copyText(REPORT_EMAIL);
            flash("信箱已複製");
          }}
          title="點一下複製"
        >
          {REPORT_EMAIL}
        </button>
        。不會自動上傳任何檔案；要附 log 請自己挑檔案附上（log 裡可能有你的電腦路徑）。
      </p>
      {d && (
        <details className="text-[11px] text-mute">
          <summary className="cursor-pointer select-none hover:text-text">看診斷資訊內容</summary>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-panel2 px-2.5 py-1.5 font-mono whitespace-pre-wrap text-text">
            {d.text}
          </pre>
        </details>
      )}
    </div>
  );
}

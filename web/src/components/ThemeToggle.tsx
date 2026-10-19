import { resolved, setThemePref, useThemePref } from "../theme";

/** 淺色 / 深色切換：偏好存在伺服器的設定檔（theme.ts）；設定頁還可以選「跟隨系統」 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const pref = useThemePref();
  const dark = resolved(pref) === "dark";
  return (
    <button onClick={() => setThemePref(dark ? "light" : "dark")} aria-label={dark ? "切換為淺色主題" : "切換為深色主題"}
      title={pref === "system" ? "目前跟隨系統；在設定頁可以改回跟隨系統" : undefined}
      className={`btn gap-2 ${className}`}>
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
      {dark ? "淺色" : "深色"}
    </button>
  );
}

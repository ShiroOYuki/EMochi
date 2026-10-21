import { Component, type ErrorInfo, type ReactNode } from "react";

/** 畫面出錯時顯示錯誤，不要整頁變白；切換分頁或按「再試一次」就恢復 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: unknown },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[EMochi] 畫面錯誤", error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-[26px] bg-panel p-6 shadow-[var(--shadow-soft)]">
        <h2 className="mb-2 text-base text-bad">這個畫面出錯了</h2>
        <p className="mb-3 text-sm text-mute">
          資料都還在伺服器上。可以先按「再試一次」；如果一直出現，把下面這段錯誤訊息貼給我。
        </p>
        <pre className="mb-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-panel2 p-3 text-xs">
          {String(this.state.error.stack || this.state.error)}
        </pre>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            再試一次
          </button>
          <button className="btn" onClick={() => location.reload()}>
            重新載入頁面
          </button>
        </div>
      </div>
    );
  }
}

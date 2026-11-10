import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a crash shows a readable message where the notch
 * would be, instead of an invisible, empty transparent window.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] render error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex w-full justify-center p-2">
        <div
          data-theme="dark"
          className="glass relative max-w-[560px] rounded-2xl px-4 py-3 text-xs text-notch-fg"
          role="alert"
        >
          <div className="mb-1 font-semibold text-[#ff6b5b]">Island Notch error</div>
          <div className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug">
            {error.message}
            {"\n"}
            {error.stack?.split("\n").slice(1, 6).join("\n")}
          </div>
          <button
            type="button"
            onClick={() => location.reload()}
            className="glass-button mt-2 rounded-full px-3 py-1 text-[11px] font-semibold"
          >
            Muat ulang
          </button>
        </div>
      </div>
    );
  }
}

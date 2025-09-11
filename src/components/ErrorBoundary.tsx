import React from "react";

type State = { hasError: boolean; msg?: string };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: any) {
    return { hasError: true, msg: String(err?.message || err) };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[App crashed]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6">
          <div className="max-w-lg text-center">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm opacity-80">{this.state.msg}</p>
            <button
              onClick={() => { localStorage.clear(); location.reload(); }}
              className="mt-4 px-3 py-2 rounded-lg border"
            >
              Clear local data & reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

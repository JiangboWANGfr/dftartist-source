// Last-resort guard: a render-time exception anywhere in the workspace used to blank the whole
// window with no message (a Rules-of-Hooks violation did exactly that), leaving nothing to
// debug from. Show the error and a reload button instead of a black screen.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null; stack: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep it in the devtools console too, with the component stack.
    console.error("[planner] render failed:", error, info.componentStack);
    this.setState({ stack: info.componentStack ?? "" });
  }

  render(): ReactNode {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 20, overflow: "auto", fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
        <div style={{ color: "#f85149", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
          The planner UI hit a render error
        </div>
        <div style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>{error.message}</div>
        <button
          onClick={() => this.setState({ error: null, stack: "" })}
          style={{ padding: "3px 10px", marginRight: 8, cursor: "pointer" }}
        >
          Try again
        </button>
        <button onClick={() => location.reload()} style={{ padding: "3px 10px", cursor: "pointer" }}>
          Reload
        </button>
        {/* The JS stack names the file and line; the component stack names the page. Both, and
            copyable — the first thing anyone is asked for is "what did it say", and re-typing a
            stack off a screenshot is how the useful half gets lost. */}
        <button
          onClick={() => void navigator.clipboard?.writeText(
            `${error.message}\n\n${error.stack ?? ""}\n\ncomponents:${stack}`)}
          style={{ padding: "3px 10px", marginLeft: 8, cursor: "pointer" }}
        >
          Copy error
        </button>
        {error.stack && (
          <pre style={{ marginTop: 14, color: "#c9d1d9", whiteSpace: "pre-wrap" }}>{error.stack}</pre>
        )}
        {stack && (
          <pre style={{ marginTop: 8, color: "#8b95a3", whiteSpace: "pre-wrap" }}>{stack}</pre>
        )}
      </div>
    );
  }
}

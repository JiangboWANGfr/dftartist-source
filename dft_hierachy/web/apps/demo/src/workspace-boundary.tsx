import { Component, type ReactNode } from "react";

interface WorkspaceBoundaryProps {
  readonly children: ReactNode;
  readonly onFailure: (error: unknown) => void;
}

/** Keep the host controls mounted while its owner reaps a failed workspace. */
export class WorkspaceBoundary extends Component<WorkspaceBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    const report = this.props.onFailure;
    console.error("Workspace rendering failed", error);
    // Lifecycle cleanup synchronously unmounts borrowers. Run it after React's
    // commit, retaining this workspace's callback rather than adopting new props.
    queueMicrotask(() => {
      try {
        report(error);
      } catch (callbackError) {
        console.error(
          "Workspace failure recovery failed",
          new AggregateError([error, callbackError]),
        );
      }
    });
  }

  override render(): ReactNode {
    return this.state.failed ? (
      <section className="demo-empty" role="alert" aria-label="工作区显示失败">
        工作区无法显示，正在释放当前设计。请稍候再重新打开。
      </section>
    ) : (
      this.props.children
    );
  }
}

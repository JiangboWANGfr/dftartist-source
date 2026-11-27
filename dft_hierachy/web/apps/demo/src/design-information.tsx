import { useEffect, useId, useSyncExternalStore } from "react";
import type { HierClient } from "@hier/client";
import type { DesignInputs } from "./design-inputs.js";
import type { Compilation } from "./design-diagnostic.js";

export function CompilationDiagnostics({ value }: { readonly value: Compilation }) {
  const { errorCount, warningCount, items, truncated } = value.result;
  if (errorCount === 0 && warningCount === 0 && items.length === 0 && !truncated) return null;
  return (
    <details className="demo-compilation">
      <summary>
        编译诊断{errorCount > 0 && ` · ${errorCount} 个错误`}{warningCount > 0 && ` · ${warningCount} 个警告`}
      </summary>
      <div className="demo-information-scroll" tabIndex={0} aria-label="编译诊断条目">
        {items.length === 0 ? <p>无已返回的诊断条目</p> : (
          <ol>
            {items.map((item, index) => (
              <li key={index}>
                <strong>{item.severity === "error" ? "错误" : "警告"}</strong>
                <span>{item.message}</span>
                {item.file !== undefined && <span>{item.file}:{item.line}</span>}
              </li>
            ))}
          </ol>
        )}
        {truncated && <p>诊断列表已截断；上方计数包含全部诊断。</p>}
      </div>
    </details>
  );
}

export function DesignInformation({ client, inputs, paused }: {
  readonly client: HierClient;
  readonly inputs: DesignInputs;
  readonly paused: boolean;
}) {
  const state = useSyncExternalStore(inputs.subscribe, inputs.getSnapshot);
  const changedId = useId();
  const snapshot = client.snapshot;
  const limited = !snapshot.inputHashComplete || state.result?.complete === false;
  useEffect(() => {
    if (paused) return;
    const check = () => { void inputs.check(); };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [inputs, paused]);
  return (
    <section className="demo-information" aria-label="设计信息">
      <div className="demo-information-line">
        <span>基于打开时的版本 · <time dateTime={snapshot.openedAt}>{snapshot.openedAt}</time></span>
        <button aria-disabled={paused && state.phase !== "pending"} onClick={() => {
          if (inputs.getSnapshot().phase === "pending") inputs.cancel();
          else if (!paused) void inputs.check();
        }}>
          {state.phase === "pending" ? "取消检查" : "检查输入变化"}
        </button>
        <span role="status" aria-live="polite" data-input-phase={state.phase}>
          {state.phase === "idle" && "尚未检查磁盘变化"}
          {state.phase === "pending" && "正在检查输入变化"}
          {state.phase === "cancelled" && "已取消检查；保留上次完成的结果"}
          {state.phase === "failed" && <>检查失败：{state.message}</>}
          {state.phase === "success" && (state.result!.changed.length > 0
            ? `检查完成：${state.result!.changed.length} 个文件已变化`
            : limited ? "已检查记录的输入；检测范围不完整" : "已检查记录的输入，未发现变化")}
        </span>
      </div>
      {limited && (
        <p className="demo-input-warning">无法检测 include 和库文件的变化，修改后请手动重新加载</p>
      )}
      {!!state.result?.changed.length && (
        <div className="demo-input-warning">
          <p>{state.phase === "success" ? "" : "上次检查发现："}输入文件已变化，重新加载后才会生效。</p>
          <details>
            <summary aria-controls={changedId}>变化的文件引用（{state.result.changed.length}，最多显示100）</summary>
            <ul id={changedId} className="demo-information-scroll" tabIndex={0}>
              {state.result.changed.slice(0, 100).map((ref, index) => <li key={index}><code>{ref}</code></li>)}
            </ul>
            {state.result.changed.length > 100 && <p>仅显示前100项；变化总数以上方Core返回为准。</p>}
          </details>
        </div>
      )}
    </section>
  );
}

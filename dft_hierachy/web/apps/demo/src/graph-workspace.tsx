import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import {
  createFoldedGraphProjection,
  type GraphFoldGroup,
} from "@hier/viewmodel";
import type { Side, TraceDirection, TracePolicy } from "@hier/protocol-types";
import { SchematicView } from "@hier/views";
import type { DesignPanels } from "./design-panels.js";
import { InstanceGrouping } from "./instance-grouping.js";
import { useWorkspaceFocusReturn } from "./workspace-focus.js";
import { ownsWorkspaceKeyboard } from "./workspace-keyboard.js";

const noCollapsedGroups: readonly string[] = Object.freeze([]);

export function GraphWorkspace({ panels: p }: { panels: DesignPanels }) {
  const owned = p.designGraph;
  const formId = useId();
  const optionsId = useId();
  const [showControls, setShowControls] = useState(false);
  const [showInformation, setShowInformation] = useState(false);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const traceCancel = useRef<HTMLButtonElement>(null);
  const groupCancel = useRef<HTMLButtonElement>(null);
  const informationButton = useRef<HTMLButtonElement>(null);
  const optionsPanel = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const returnFocus = useWorkspaceFocusReturn();
  const information = () => frame.current?.querySelector(".hier-schematic-view__information") ?? null;
  const presentControls = (visible: boolean) => returnFocus(
    visible ? [] : [optionsPanel.current], optionsButton.current,
    () => setShowControls(visible),
  );
  const presentInformation = (visible: boolean) => returnFocus(
    visible ? [] : [information()], informationButton.current,
    () => setShowInformation(visible),
  );
  const [frameHeight, setFrameHeight] = useState(240);
  useLayoutEffect(() => {
    const element = frame.current!;
    const measure = () => {
      if (element.clientHeight > 0) setFrameHeight(element.clientHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const [grouping] = useState(() => new InstanceGrouping(owned));
  const preserveControlFocus = useCallback((notify: () => void) => {
    const state = grouping.getSnapshot();
    // A graph notification can precede the grouping subscription's clear.
    const groupPending = state.graph === owned.graph.state && state.status === "pending";
    returnFocus([
      owned.trace.state.status !== "pending" ? traceCancel.current : null,
      !groupPending ? groupCancel.current : null,
    ], optionsButton.current, notify);
  }, [owned, grouping, returnFocus]);
  const subscribeGraph = useCallback(
    (notify: () => void) => owned.graph.subscribe(() => preserveControlFocus(notify)),
    [owned, preserveControlFocus],
  );
  const subscribeGrouping = useCallback(
    (notify: () => void) => grouping.subscribe(() => preserveControlFocus(notify)),
    [grouping, preserveControlFocus],
  );
  const graph = useSyncExternalStore(subscribeGraph, () => owned.graph.state);
  const selection = useSyncExternalStore(
    (cb) => p.selection.subscribe(cb),
    () => p.selection.current,
  );
  const [direction, setDirection] = useState<TraceDirection>("back");
  const [policy, setPolicy] = useState<TracePolicy>("combinational");
  const [side, setSide] = useState<Side | "">("");
  const [lsb, setLsb] = useState("0");
  const [width, setWidth] = useState("1");
  const [maxNodes, setMaxNodes] = useState("100");
  const [folds, setFolds] = useState<{
    groups: readonly GraphFoldGroup[] | undefined;
    collapsed: readonly string[];
  }>({ groups: undefined, collapsed: noCollapsedGroups });
  const groupState = useSyncExternalStore(subscribeGrouping, grouping.getSnapshot);
  const currentGroups = groupState.graph === graph ? groupState.groups : undefined;
  const currentStatus = groupState.graph === graph ? groupState.status : undefined;
  // A fresh successful result starts expanded in this render, without an intermediate projection.
  const collapsed = folds.groups === currentGroups ? folds.collapsed : noCollapsedGroups;
  const only = selection.items.length === 1 ? selection.items[0] : undefined;
  const target = only?.ref === undefined ? undefined : only;
  useEffect(() => {
    setLsb(String(target?.bits?.lsb ?? 0));
    setWidth(String(target?.bits?.width ?? 1));
    setSide(target?.side ?? "");
  }, [target]);
  const projection = useMemo(() => {
    const nodes = graph.nodes.filter((member) => member.node.kind === "design").map((n) => n.id);
    const groups: readonly GraphFoldGroup[] =
      currentGroups ??
      (nodes.length ? [{ kind: "hierarchy", key: "trace", label: "追踪显示组", nodes }] : []);
    return createFoldedGraphProjection(owned.graph, {
      groups,
      collapsed: collapsed.filter((key) => groups.some((group) => group.key === key)),
    });
  }, [owned, graph, collapsed, currentGroups]);
  // Layout failures stay in the service state; only command reports use the host notice.
  const reportSchematic = useCallback(
    (failure: { readonly command: string; readonly error: unknown }) => {
      if (failure.command === "select" || failure.command === "fold") p.onCommandError(failure);
    },
    [p],
  );
  const invoke = (command: () => void | Promise<unknown>) => {
    try {
      const result = command();
      if (result) p.consume(result);
    } catch (failure) {
      p.onCommandError({ error: failure });
    }
  };
  return (
    <section
      className="demo-graph"
      aria-label="图工作区"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !ownsWorkspaceKeyboard(event)) return;
        const active = event.currentTarget.ownerDocument.activeElement;
        if (showControls && optionsPanel.current?.contains(active)) {
          presentControls(false);
          event.preventDefault();
        } else if (
          showInformation &&
          information()?.contains(active)
        ) {
          presentInformation(false);
          event.preventDefault();
        }
      }}
    >
      <div className="demo-graph-toolbar">
        <form
          id={formId}
          className="demo-graph-controls"
          onSubmit={(event) => {
            event.preventDefault();
            if (!target) return;
            void p.loadTrace({
              start: {
                slice: { ref: target.ref, bits: { lsb: Number(lsb), width: Number(width) } },
                ...(side ? { side } : {}),
              },
              direction,
              policy,
              budget: {
                maxNodes: Number(maxNodes),
                maxEdges: 200,
                maxDepth: 20,
                maxMillis: 1000,
              },
            });
          }}
        >
          <label>
            方向{" "}
            <select
              aria-label="追踪方向"
              value={direction}
              onChange={(e) => setDirection(e.target.value as TraceDirection)}
            >
              <option value="back">上游</option>
              <option value="forward">下游</option>
            </select>
          </label>

          <label>
            端口侧{" "}
            <select
              aria-label="追踪侧"
              value={side}
              onChange={(e) => setSide(e.target.value as Side | "")}
            >
              <option value="">未指定</option>
              <option value="inside">内部</option>
              <option value="outside">外部</option>
            </select>
          </label>

          <button type="submit" disabled={!target}>
            追踪所选对象
          </button>
        </form>

        <div className="demo-graph-controls">
          <button
            ref={traceCancel}
            hidden={owned.trace.state.status !== "pending"}
            disabled={owned.trace.state.status !== "pending"}
            onClick={() => void p.cancelTrace()}
          >
            取消追踪
          </button>
        </div>
        <button
          ref={optionsButton}
          aria-expanded={showControls}
          aria-controls={optionsId}
          onClick={() => presentControls(!showControls)}
        >
          高级控制
        </button>
        <button
          ref={informationButton}
          aria-expanded={showInformation}
          onClick={() => presentInformation(!showInformation)}
        >
          来源与详情
        </button>
      </div>
      <div
        ref={optionsPanel}
        id={optionsId}
        className="demo-graph-options"
        hidden={!showControls}
        onInvalidCapture={() => flushSync(() => setShowControls(true))}
      >
        <details
          className="demo-advanced"
          onInvalidCapture={(event) => {
            event.currentTarget.open = true;
          }}
        >
          <summary>追踪选项</summary>
          <div className="demo-graph-controls">
            <label>
              策略{" "}
              <select
                form={formId}
                aria-label="追踪策略"
                value={policy}
                onChange={(e) => setPolicy(e.target.value as TracePolicy)}
              >
                <option value="combinational">组合</option>
                <option value="structural">结构</option>
                <option value="full">完整</option>
              </select>
            </label>
            <label>
              lsb{" "}
              <input
                form={formId}
                aria-label="追踪 lsb"
                type="number"
                min={0}
                max={4294967295}
                required
                value={lsb}
                onChange={(e) => setLsb(e.target.value)}
              />
            </label>
            <label>
              width{" "}
              <input
                form={formId}
                aria-label="追踪 width"
                type="number"
                min={1}
                max={4294967295}
                required
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </label>
            <label>
              节点上限{" "}
              <input
                form={formId}
                aria-label="追踪节点上限"
                type="number"
                min={1}
                max={100}
                required
                value={maxNodes}
                onChange={(e) => setMaxNodes(e.target.value)}
              />
            </label>
          </div>
        </details>
        <button onClick={() => void p.clearTrace()}>清除追踪</button>
        <details className="demo-advanced">
          <summary>演示与标注</summary>
          <div className="demo-graph-controls">
            <button
              disabled={!target}
              onClick={() => target && invoke(() => owned.showExample(target))}
            >
              添加外部示例
            </button>
            <button onClick={() => invoke(() => owned.example.clear())}>移除外部示例</button>
            <button
              disabled={!selection.items.some((item) => item.ref !== undefined)}
              onClick={() =>
                invoke(() =>
                  owned.annotation.set(
                    [
                      ...new Set(
                        selection.items.flatMap((item) =>
                          item.ref === undefined ? [] : [item.ref],
                        ),
                      ),
                    ].map((ref) => ({
                      ref,
                      mark: {
                        color: "#b45309",
                        badge: "已标注",
                        tooltip: "宿主手动标注；非分析结论",
                      },
                    })),
                  ),
                )
              }
            >
              标注所选对象
            </button>
            <button onClick={() => invoke(() => owned.annotation.clear())}>清除标注</button>
          </div>
        </details>
        <section aria-label="追踪显示分组">
          <details className="demo-advanced">
            <summary>分组与折叠</summary>
            <div className="demo-graph-controls">
              <button
                disabled={!graph.nodes.some((member) => member.node.kind === "design")}
                onClick={() => void grouping.load()}
              >
                按所属实例分组
              </button>
              <button
                ref={groupCancel}
                disabled={currentStatus !== "pending"}
                onClick={() => grouping.cancel()}
              >
                取消分组查询
              </button>
              <button
                onClick={() => {
                  grouping.clear();
                  setFolds({ groups: undefined, collapsed: noCollapsedGroups });
                }}
              >
                使用追踪显示组
              </button>
            </div>
          </details>
        </section>
        <details className="demo-graph-help">
          <summary>追踪与分组说明</summary>
          <p>
            选择信号或端口，检查位范围和端口侧后追踪。演示预算：最多 100 节点 / 200 边 / 20 层 /
            1000 ms；布局期限 15 秒。
          </p>
          <p>
            实例组按 Core
            返回的直接所属实例生成，无对象引用的节点留在组外。追踪边束仅按有向显示端点捆束，不表示同一电气总线。图变化后需重新获取实例分组；折叠或展开后点击“布局”。
          </p>
          <p>
            追踪显示组仅用于折叠展示，不代表设计实例层级。图与源码、树共享选择；多对象选择不猜测唯一源码目标。
          </p>
        </details>
      </div>
      {currentStatus && (
        <output role="status">
          分组查询：{currentStatus}
          {groupState.message && ` · ${groupState.message}`}
        </output>
      )}
      <div className="demo-graph-summary" aria-label="追踪状态" aria-live="polite">
        {graph.sources.map((source) => (
          <span key={source.id}>
            {source.label} · {source.status}
            {source.content && (
              <>
                {" "}
                · {source.content.completeness.status}
                {source.content.completeness.reasons.map((reason, i) => (
                  <span key={i}> · {reason.code}</span>
                ))}
              </>
            )}
            {source.error && (
              <>
                {" "}
                · {source.error.code}: {source.error.message}
              </>
            )}
          </span>
        ))}
      </div>
      <div
        ref={frame}
        className="demo-schematic-frame"
        data-information={showInformation ? "open" : "closed"}
      >
        <SchematicView
          className="demo-schematic"
          graph={owned.graph}
          layout={owned.layout}
          selection={p.selection}
          projection={projection}
          onFoldChange={(options) => setFolds({ groups: currentGroups, collapsed: options.collapsed })}
          annotations={owned.annotations}
          ariaLabel="设计原理图"
          height={frameHeight}
          onCommandError={reportSchematic}
        />
      </div>
    </section>
  );
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ElectronBridge } from "@hier/client/electron/renderer";
import type { Side, SourceKind } from "@hier/protocol-types";
import {
  DefinitionInstancesView,
  HierarchyTree,
  ObjectConnectionsView,
  PathResolutionView,
  PropertiesPanel,
  SearchResultsView,
  SourceCandidatesView,
  SourceView,
  type SourceViewPositionQuery,
} from "@hier/views";
import type { DemoBridge, DemoPickOptions } from "./bridge.js";
import type { DesignPanels } from "./design-panels.js";
import { DesignLifecycle, type Phase } from "./design-lifecycle.js";
import { WorkspaceBoundary } from "./workspace-boundary.js";
import { CompilationDiagnostics, DesignInformation } from "./design-information.js";
import { GraphWorkspace } from "./graph-workspace.js";
import { useWorkspaceWidths, WorkspaceDivider } from "./workspace-widths.js";
import { useWorkspaceSplit } from "./workspace-split.js";
import { useWorkspaceFocusReturn } from "./workspace-focus.js";
import { ownsWorkspaceKeyboard } from "./workspace-keyboard.js";
import "@hier/views/hierarchy-tree.css";
import "@hier/views/properties-panel.css";
import "@hier/views/object-connections-view.css";
import "@hier/views/source-view.css";
import "@hier/views/source-candidates-view.css";
import "@hier/views/search-results-view.css";
import "@hier/views/definition-instances-view.css";
import "@hier/views/path-resolution-view.css";
import "@hier/views/schematic-view.css";
import "./style.css";

declare global {
  interface Window {
    readonly hierDemo: DemoBridge;
    readonly hierBridge: ElectronBridge;
  }
}
function designOperationPending(phase: Phase): boolean {
  return ["picking", "closing", "opening", "connecting"].includes(phase);
}

function App() {
  const [lifecycle] = useState(() => new DesignLifecycle(
    window.hierDemo, window.hierBridge, (change) => flushSync(change),
  ));
  const designStatus = useRef<HTMLParagraphElement>(null);
  const appRoot = useRef<HTMLElement>(null);
  const designInformation = useRef<HTMLDivElement>(null);
  const operationNotice = useRef<HTMLElement>(null);
  const cancelOpen = useRef<HTMLButtonElement>(null);
  const kindInput = useRef<HTMLSelectElement>(null);
  const topInput = useRef<HTMLInputElement>(null);
  const openDesignButton = useRef<HTMLButtonElement>(null);
  const closeDesignButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useWorkspaceFocusReturn();
  const subscribe = useCallback((notify: () => void) => lifecycle.subscribe(() => {
    const next = lifecycle.getSnapshot();
    const nextPending = designOperationPending(next.phase);
    // Capture ownership while the outgoing controls still exist, before React removes them.
    returnFocus([
      ...(nextPending ? [
        kindInput.current, topInput.current, openDesignButton.current,
      ] : []),
      nextPending || !next.active ? closeDesignButton.current : null,
      next.operationMessage === undefined ? operationNotice.current : null,
      next.phase !== "connecting" ? cancelOpen.current : null,
      !next.active?.inputs && !next.compilation ? designInformation.current : null,
      ...(!next.active?.panels ? [
        appRoot.current?.querySelector(".demo-workspace-toolbar") ?? null,
        appRoot.current?.querySelector(".demo-queries") ?? null,
        appRoot.current?.querySelector(".demo-columns") ?? null,
      ] : []),
    ], designStatus.current, notify);
  }), [lifecycle, returnFocus]);
  const { phase, message, operationMessage, active, compilation } = useSyncExternalStore(
    subscribe, lifecycle.getSnapshot,
  );
  const [kind, setKind] = useState<DemoPickOptions["kind"]>("source");
  const [top, setTop] = useState("");
  useEffect(() => {
    const release = () => lifecycle.releaseDocument();
    window.addEventListener("beforeunload", release);
    return () => {
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, [lifecycle]);
  const pending = designOperationPending(phase);
  return (
    <main ref={appRoot} className="demo">
      <header>
        <form className="demo-toolbar" aria-label="设计操作" onSubmit={(event) => {
          event.preventDefault();
          void lifecycle.open({ kind, ...(top === "" ? {} : { top }) });
        }}>
          <strong>DFT Hierarchy</strong>
          <label>
            输入类型{" "}
            <select
              ref={kindInput}
              value={kind}
              disabled={pending}
              onChange={(e) => setKind(e.target.value as DemoPickOptions["kind"])}
            >
              <option value="source">HDL 文件</option>
              <option value="filelist">文件列表</option>
            </select>
          </label>
          <label>
            顶层{" "}
            <input
              ref={topInput}
              aria-label="顶层"
              value={top}
              disabled={pending}
              onChange={(e) => setTop(e.target.value)}
              placeholder="可选"
            />
          </label>
          <button
            ref={openDesignButton}
            type="submit"
            disabled={pending}
          >
            打开设计
          </button>
          <button
            ref={closeDesignButton}
            type="button"
            disabled={pending || !active}
            onClick={() => {
              void lifecycle.close(false);
            }}
          >
            关闭设计
          </button>
          {phase === "connecting" && (
            <button
              ref={cancelOpen}
              type="button"
              onClick={() => {
                void lifecycle.close(true);
              }}
            >
              取消打开
            </button>
          )}
        </form>
      </header>
      <p
        ref={designStatus}
        className="demo-status"
        role="status"
        aria-label="设计状态"
        aria-live="polite"
        tabIndex={-1}
        data-phase={phase}
      >
        {message}
      </p>
      {(active?.inputs || compilation) && (
        <div ref={designInformation} className="demo-design-information">
          {active?.inputs && (
            <DesignInformation
              key={active.id} client={active.client!} inputs={active.inputs} paused={pending}
            />
          )}
          {compilation && <CompilationDiagnostics key={active?.id ?? "failed"} value={compilation} />}
        </div>
      )}
      {operationMessage !== undefined && (
        <section ref={operationNotice} className="demo-operation-notice" aria-label="最近一次操作提示">
          <p role="status" aria-live="polite">
            <strong>最近一次操作提示</strong>
            <span>{operationMessage}</span>
          </p>
          <button
            onClick={() => {
              lifecycle.dismissOperationMessage();
            }}
          >
            关闭操作提示
          </button>
        </section>
      )}
      {active?.panels ? (
        <WorkspaceBoundary
          key={active.id}
          onFailure={(error) => lifecycle.workspaceFailed(active.id, error)}
        >
          <Workspace panels={active.panels} />
        </WorkspaceBoundary>
      ) : (
        <div className="demo-empty">打开设计后，可浏览层级、属性、连接与源码。</div>
      )}
    </main>
  );
}

/** Supply a finite viewport to the existing virtualized views as the window changes. */
function Pane({ title, children }: { title: string; children: (height: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(180);
  useLayoutEffect(() => {
    const element = ref.current!;
    const measure = () => {
      if (element.clientHeight > 0) setHeight(element.clientHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <section className="demo-pane">
      <h2>{title}</h2>
      <div className="demo-viewport" ref={ref}>
        {children(height)}
      </div>
    </section>
  );
}
const inspectorTabs = ["实例属性", "对象连接", "搜索结果", "定义实例", "路径结果"] as const;
type InspectorTab = (typeof inspectorTabs)[number];

/** Keep candidate sizing local; read the existing CSS minimums and measured controls. */
function useSourceCandidateHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ min: 200, max: 200 });
  const [preference, setPreference] = useState<number>();
  useLayoutEffect(() => {
    const source = ref.current!;
    const pane = source.querySelector<HTMLElement>(":scope > .demo-pane")!;
    const controls = source.querySelector<HTMLElement>(".demo-source-controls")!;
    const toggle = source.querySelector<HTMLElement>(".demo-candidates-toggle")!;
    const slot = source.querySelector<HTMLElement>(".demo-candidates-slot")!;
    const measure = () => {
      // Hidden source mounts keep their last measured bounds and their user preference.
      if (source.clientHeight === 0) return;
      const min = parseFloat(getComputedStyle(slot).minHeight);
      const sourceMinimum = parseFloat(getComputedStyle(pane).flexBasis);
      const gaps = 3 * parseFloat(getComputedStyle(source).rowGap);
      const remaining = source.clientHeight - controls.offsetHeight - toggle.offsetHeight - gaps;
      const max = Math.max(min, Math.min(420, remaining - sourceMinimum));
      setBounds((previous) =>
        previous.min === min && previous.max === max ? previous : { min, max },
      );
    };
    const observer = new ResizeObserver(measure);
    for (const element of [source, controls, toggle]) observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return {
    ref,
    divider: {
      min: bounds.min,
      max: bounds.max,
      value: Math.min(bounds.max, Math.max(bounds.min, preference ?? bounds.min)),
      onChange: setPreference,
      onCancel: () => setPreference(preference),
      onReset: () => setPreference(undefined),
    },
  };
}

function Workspace({ panels: p }: { panels: DesignPanels }) {
  const navigation = useSyncExternalStore(
    (cb) => p.navigation.subscribe(cb),
    () => p.navigation.state,
  );
  const selection = useSyncExternalStore(
    (cb) => p.selection.subscribe(cb),
    () => p.selection.current,
  );
  const connections = useSyncExternalStore(
    (cb) => p.connections.subscribe(cb),
    () => p.connections.state,
  );
  const [sourceKind, setSourceKind] = useState<SourceKind>("definition");
  const [search, setSearch] = useState("");
  const [path, setPath] = useState("");
  const [showGraph, setShowGraph] = useState(false);
  const [showQueries, setShowQueries] = useState(true);
  const queriesId = useId();
  const queriesToggle = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const presentQueries = (visible: boolean) => {
    if (visible) {
      flushSync(() => setShowQueries(true));
      searchInput.current?.focus();
    } else {
      returnFocus([document.getElementById(queriesId)], queriesToggle.current,
        () => flushSync(() => setShowQueries(false)));
    }
  };
  const [showNavigation, setShowNavigation] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [view, setView] = useState<"source" | "graph" | "split">("source");
  const [inspector, setInspector] = useState<InspectorTab>("实例属性");
  const [showCandidates, setShowCandidates] = useState(false);
  const widths = useWorkspaceWidths(showNavigation, showInspector);
  const candidateHeight = useSourceCandidateHeight();
  const split = useWorkspaceSplit();
  const graphId = useId();
  const navigationId = useId();
  const inspectorId = useId();
  const inspectorRoot = useRef<HTMLDivElement>(null);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const inspectorToggle = useRef<HTMLButtonElement>(null);
  const graphToggle = useRef<HTMLButtonElement>(null);
  const sourceTab = useRef<HTMLButtonElement>(null);
  const graphTab = useRef<HTMLButtonElement>(null);
  const candidatesToggle = useRef<HTMLButtonElement>(null);
  const returnFocus = useWorkspaceFocusReturn();
  const ownedRegion = (id: string) => [
    document.getElementById(id),
    document.querySelector(`[role="separator"][aria-controls="${id}"]`),
  ] as const;
  const changeInspector = (next: InspectorTab) => {
    const nextId = inspectorId + "-panel-" + inspectorTabs.indexOf(next);
    const outgoing = [...(inspectorRoot.current?.querySelectorAll(".demo-inspector-panel") ?? [])]
      .filter((panel) => panel.id !== nextId);
    returnFocus(
      [...outgoing, inspectorRoot.current?.querySelector(".demo-result-close") ?? null],
      document.getElementById(inspectorId + "-tab-" + inspectorTabs.indexOf(next)),
      () => setInspector(next),
    );
  };
  const changeView = (next: typeof view) => {
    const [graph, divider] = ownedRegion(graphId);
    const outgoing = next === "source" ? [graph, divider] :
      next === "graph" ? [candidateHeight.ref.current, divider] : [];
    returnFocus(outgoing, next === "source" ? sourceTab.current : graphTab.current,
      () => setView(next));
  };
  const sourceId = useId();
  const candidateDocument = navigation.candidates?.document;
  const candidateOffset = navigation.candidates?.utf16Offset;
  useEffect(() => {
    returnFocus(
      ownedRegion(sourceId), candidatesToggle.current,
      () => setShowCandidates(candidateDocument !== undefined),
    );
  }, [candidateDocument, candidateOffset, navigation.refresh]);
  useEffect(
    () =>
      p.selection.subscribe((next) => {
        if (next.origin !== "source") setSourceKind("definition");
        changeInspector(
          next.items.length === 1 && next.items[0]?.def !== undefined ? "定义实例" : "实例属性",
        );
      }),
    [p],
  );
  const commandError = p.onCommandError;
  const positionQuery = useMemo<SourceViewPositionQuery>(
    () => ({
      locate: (document, offset) => {
        setShowCandidates(true);
        return p.navigation.locate(document, offset);
      },
      onError: p.onCommandError,
    }),
    [p],
  );
  const only = selection.items.length === 1 ? selection.items[0] : undefined;
  const sourceTarget = navigation.document.target;
  // Source confirmation can retain another target even when its kind is unchanged.
  // Keep the current selection's kind reachable without loading during confirmation.
  const retainedSource =
    !!only &&
    ((only.def !== undefined && sourceKind !== "definition") ||
      (selection.origin === "source" &&
        sourceTarget !== null &&
        (sourceTarget.ref !== (only.def ?? only.ref) || sourceTarget.kind !== sourceKind)));
  return (
    <>
      <div className="demo-view-switch demo-workspace-toolbar" role="group" aria-label="工作区视图">
        <button
          ref={navigationToggle}
          aria-label="设计导航"
          aria-expanded={showNavigation}
          onClick={() => returnFocus(
            ownedRegion(navigationId), navigationToggle.current,
            () => setShowNavigation(!showNavigation),
          )}
        >
          导航
        </button>
        <button
          ref={sourceTab}
          aria-pressed={!showGraph || view === "source"}
          onClick={() => changeView("source")}
        >
          源码
        </button>
        <button
          ref={graphTab}
          disabled={!showGraph}
          aria-pressed={showGraph && view === "graph"}
          onClick={() => changeView("graph")}
        >
          原理图
        </button>
        <button
          disabled={!showGraph}
          aria-pressed={showGraph && view === "split"}
          onClick={() => changeView("split")}
        >
          双视图
        </button>
        <button
          className="demo-queries-toggle"
          ref={queriesToggle}
          aria-expanded={showQueries}
          aria-controls={queriesId}
          title="展开或收起搜索与路径定位"
          onClick={() => presentQueries(!showQueries)}
        >
          查询工具
        </button>
        <button
          ref={graphToggle}
          aria-expanded={showGraph}
          onClick={() => {
            if (showGraph) {
              // Unmount borrowed views before cancelling the host-owned tasks.
              returnFocus(ownedRegion(graphId), graphToggle.current, () =>
                flushSync(() => {
                  setShowGraph(false);
                  setView("source");
                }),
              );
              p.consume(p.designGraph.cancelPending());
            } else {
              returnFocus([candidateHeight.ref.current], graphTab.current, () => {
                setShowGraph(true);
                setView("graph");
              });
            }
          }}
        >
          {showGraph ? "收起原理图" : "显示原理图"}
        </button>
        <button
          ref={inspectorToggle}
          className="demo-inspector-toggle"
          aria-label="对象详情"
          aria-expanded={showInspector}
          onClick={() => returnFocus(
            ownedRegion(inspectorId), inspectorToggle.current,
            () => setShowInspector(!showInspector),
          )}
        >
          详情
        </button>
      </div>
      <div
        id={queriesId}
        className="demo-queries"
        role="region"
        aria-label="搜索与路径查询"
        hidden={!showQueries}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !ownsWorkspaceKeyboard(event)) return;
          event.preventDefault();
          event.stopPropagation();
          presentQueries(false);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setShowInspector(true);
            changeInspector("搜索结果");
            void p.searchText(search);
          }}
        >
          <label>
            搜索{" "}
            <input
              ref={searchInput}
              aria-label="搜索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button>搜索</button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setShowInspector(true);
            changeInspector("路径结果");
            void p.resolvePath(path);
          }}
        >
          <label>
            路径 <input aria-label="路径" value={path} onChange={(e) => setPath(e.target.value)} />
          </label>
          <button>定位</button>
        </form>
      </div>
      <div
        className="demo-columns"
        ref={widths.ref}
        style={widths.style}
        data-navigation={showNavigation ? "open" : "closed"}
        data-inspector={showInspector ? "open" : "closed"}
      >
        <div id={navigationId} className="demo-left" hidden={!showNavigation}>
          <Pane title="设计层级">
            {(height) => (
              <HierarchyTree
                tree={p.tree}
                selection={p.selection}
                annotations={p.designGraph.annotations}
                ariaLabel="设计层级"
                height={height}
                onCommandError={commandError}
              />
            )}
          </Pane>
        </div>
        <WorkspaceDivider
          label="设计导航宽度"
          controls={navigationId}
          side="left"
          hidden={!showNavigation}
          {...widths.navigation}
        />
        <div className="demo-center">
          <div
            ref={split.ref}
            style={split.style}
            className={`demo-main-content${showGraph && view === "split" ? " demo-main-content--split" : ""}`}
          >
            {showGraph && (
              <div id={graphId} className="demo-graph-slot" hidden={view === "source"}>
                <GraphWorkspace panels={p} />
              </div>
            )}
            <WorkspaceDivider
              key={split.axis}
              label="原理图与源码分隔"
              controls={graphId}
              hidden={!showGraph || view !== "split"}
              {...split.divider}
            />
            <div
              ref={candidateHeight.ref}
              className="demo-source-workspace"
              hidden={showGraph && view === "graph"}
            >
              <div className="demo-source-controls">
                <label>
                  源码范围{" "}
                  <select
                    aria-label="源码范围"
                    value={retainedSource ? "" : sourceKind}
                    disabled={!only}
                    onChange={(e) => {
                      const value = e.target.value as SourceKind;
                      setSourceKind(value);
                      p.sourceKind(value);
                    }}
                  >
                    {retainedSource && (
                      <option value="" disabled>
                        当前文档（保留）
                      </option>
                    )}
                    <option value="definition">定义</option>
                    {only?.def === undefined && (
                      <>
                        <option value="instantiation">实例化</option>
                        <option value="statement">语句</option>
                      </>
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={sourceTarget === null}
                  onClick={() =>
                    navigation.document.status === "pending" ? p.cancelSource() : p.reloadSource()
                  }
                >
                  {navigation.document.status === "pending" ? "取消源码请求" : "刷新源码"}
                </button>
              </div>
              <Pane title="设计源码">
                {(height) => (
                  <SourceView
                    state={navigation.document}
                    ariaLabel="设计源码"
                    height={height}
                    positionQuery={positionQuery}
                  />
                )}
              </Pane>
              <button
                ref={candidatesToggle}
                className="demo-candidates-toggle"
                aria-expanded={showCandidates}
                aria-controls={sourceId}
                onClick={() => returnFocus(
                  ownedRegion(sourceId), candidatesToggle.current,
                  () => flushSync(() => setShowCandidates(!showCandidates)),
                )}
              >
                源码候选 {showCandidates ? "收起" : "展开"}
              </button>
              <div
                id={sourceId}
                className="demo-candidates-slot"
                hidden={!showCandidates}
                style={{ flexBasis: candidateHeight.divider.value }}
              >
                <WorkspaceDivider
                  label="源码候选高度"
                  controls={sourceId}
                  side="bottom"
                  hidden={!showCandidates || (showGraph && view === "graph")}
                  {...candidateHeight.divider}
                />
                <Pane title="源码候选">
                  {(height) => (
                    <SourceCandidatesView
                      navigation={p.navigation}
                      selection={p.selection}
                      ariaLabel="源码候选"
                      height={height}
                      onCommandError={commandError}
                    />
                  )}
                </Pane>
              </div>
            </div>
          </div>
        </div>
        <WorkspaceDivider
          label="对象详情宽度"
          controls={inspectorId}
          side="right"
          hidden={!showInspector}
          {...widths.inspector}
        />
        <div id={inspectorId} className="demo-right" ref={inspectorRoot} hidden={!showInspector}>
          <div className="demo-inspector-tabs" role="tablist" aria-label="对象与查询详情">
            {inspectorTabs.map((title, index) => (
              <button
                key={title}
                id={inspectorId + "-tab-" + index}
                role="tab"
                aria-selected={inspector === title}
                aria-controls={inspectorId + "-panel-" + index}
                tabIndex={inspector === title ? 0 : -1}
                onClick={() => flushSync(() => changeInspector(title))}
                onKeyDown={(event) => {
                  if (!ownsWorkspaceKeyboard(event)) return;
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? inspectorTabs.length - 1
                        : event.key === "ArrowRight"
                          ? (index + 1) % inspectorTabs.length
                          : event.key === "ArrowLeft"
                            ? (index + inspectorTabs.length - 1) % inspectorTabs.length
                            : undefined;
                  if (next === undefined) return;
                  event.preventDefault();
                  flushSync(() => setInspector(inspectorTabs[next]!));
                  document.getElementById(inspectorId + "-tab-" + next)?.focus();
                }}
              >
                {title}
              </button>
            ))}
          </div>
          {(inspector === "搜索结果" || inspector === "路径结果") && (
            <button
              className="demo-result-close"
              onClick={() => changeInspector(only?.def === undefined ? "实例属性" : "定义实例")}
            >
              收起查询结果
            </button>
          )}
          <div
            className="demo-inspector-panel"
            role="tabpanel"
            id={inspectorId + "-panel-0"}
            aria-labelledby={inspectorId + "-tab-0"}
            hidden={inspector !== "实例属性"}
          >
            <Pane title="实例属性">
              {(height) => (
                <PropertiesPanel
                  properties={p.properties}
                  selection={p.selection}
                  ariaLabel="实例属性"
                  height={height}
                  onCommandError={commandError}
                />
              )}
            </Pane>
          </div>
          <div
            className="demo-inspector-panel demo-connections-panel"
            role="tabpanel"
            id={inspectorId + "-panel-1"}
            aria-labelledby={inspectorId + "-tab-1"}
            hidden={inspector !== "对象连接"}
          >
            <label className="demo-connections-controls">
              连接侧
              <select
                value={connections.target?.side ?? ""}
                disabled={connections.target === null}
                onChange={(event) => {
                  const target = connections.target;
                  if (!target || p.connections.disposed || p.connections.state.target !== target)
                    return;
                  const side = event.target.value as Side | "";
                  void p.loadConnections({
                    slice: target.slice,
                    reach: target.reach,
                    ...(side ? { side } : {}),
                  });
                }}
              >
                <option value="">未指定</option>
                <option value="inside">内部</option>
                <option value="outside">外部</option>
              </select>
            </label>
            <Pane title="对象连接">
              {(height) => (
                <ObjectConnectionsView
                  connections={p.connections}
                  selection={p.selection}
                  ariaLabel="对象连接"
                  height={height}
                  onCommandError={commandError}
                />
              )}
            </Pane>
          </div>
          <div
            className="demo-inspector-panel"
            role="tabpanel"
            id={inspectorId + "-panel-2"}
            aria-labelledby={inspectorId + "-tab-2"}
            hidden={inspector !== "搜索结果"}
          >
            <Pane title="搜索结果">
              {(height) => (
                <SearchResultsView
                  search={p.search}
                  selection={p.selection}
                  ariaLabel="搜索结果"
                  height={height}
                  onCommandError={commandError}
                />
              )}
            </Pane>
          </div>
          <div
            className="demo-inspector-panel"
            role="tabpanel"
            id={inspectorId + "-panel-3"}
            aria-labelledby={inspectorId + "-tab-3"}
            hidden={inspector !== "定义实例"}
          >
            <Pane title="定义实例">
              {(height) => (
                <DefinitionInstancesView
                  instances={p.instances}
                  selection={p.selection}
                  ariaLabel="定义实例"
                  height={height}
                  onCommandError={commandError}
                />
              )}
            </Pane>
          </div>
          <div
            className="demo-inspector-panel"
            role="tabpanel"
            id={inspectorId + "-panel-4"}
            aria-labelledby={inspectorId + "-tab-4"}
            hidden={inspector !== "路径结果"}
          >
            <Pane title="路径结果">
              {(height) => (
                <PathResolutionView
                  resolution={p.resolution}
                  selection={p.selection}
                  ariaLabel="路径结果"
                  height={height}
                  onCommandError={commandError}
                />
              )}
            </Pane>
          </div>
        </div>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

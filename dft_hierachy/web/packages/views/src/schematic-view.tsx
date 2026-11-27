import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { resolveObjectAnnotations } from "@hier/viewmodel";
import { useSchematicCommands } from "./schematic-commands.js";
import {
  SchematicSources,
  SchematicDetails,
  type SchematicDescriptor,
} from "./schematic-details.js";
import { useObjectSelectionMatch } from "./object-selection-match.js";
import { SchematicGeometry } from "./schematic-geometry.js";
import type { AnySchematicViewProps } from "./schematic-view-types.js";
import { useAnnotations } from "./annotation-subscription.js";
import { indexAnnotations } from "./annotation-lookup.js";
import {
  createAnnotationDescriptions,
  GraphAnnotations,
  AnnotationDetails,
} from "./annotation-presentation.js";

type Descriptor = SchematicDescriptor;
const keyOf = (descriptor: Descriptor) => `${descriptor.target.kind}:${descriptor.target.id}`;

/** Stable ref callbacks avoid moving DOM focus during ordinary highlight rerenders. */
function GraphItem(props: {
  descriptor: Descriptor;
  annotationDescription: string | undefined;
  group: RefObject<SVGSVGElement>;
  pressed: boolean;
  disabled: boolean;
  tabIndex: number;
  isCurrentFrame: () => boolean;
  onFocus: () => void;
  onActivate: () => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
  children: ReactNode;
}): ReactElement {
  const previous = useRef<SVGGElement | null>(null);
  const ref = useCallback(
    (element: SVGGElement | null) => {
      const old = previous.current;
      if (!element && old && old.contains(old.ownerDocument.activeElement))
        props.group.current?.focus();
      previous.current = element;
    },
    [props.group],
  );
  return (
    <g
      ref={ref}
      role="button"
      data-graph-key={keyOf(props.descriptor)}
      aria-label={`${props.descriptor.target.kind} ${props.descriptor.target.id} ${props.descriptor.label}${props.annotationDescription === undefined ? "" : `\n${props.annotationDescription}`}`}
      aria-pressed={props.pressed}
      aria-disabled={props.disabled}
      tabIndex={props.tabIndex}
      onFocus={() => {
        if (props.isCurrentFrame()) props.onFocus();
      }}
      onKeyDown={(event) => {
        if (props.isCurrentFrame()) props.onKeyDown(event);
      }}
      onClick={(event) => {
        if (!props.isCurrentFrame()) return;
        event.currentTarget.focus();
        props.onFocus();
        props.onActivate();
      }}
    >
      {props.children}
    </g>
  );
}

export function SchematicView(props: AnySchematicViewProps): ReactElement {
  const view = useSchematicCommands(props);
  const { session, state, layout, result, projection, selectable, selected } = view;
  const annotations = useAnnotations(state.snapshotId, props.annotations, session);
  const matchesSelection = useObjectSelectionMatch(selected);
  const group = useRef<SVGSVGElement>(null);
  const marker = `hier-arrow-${useId().replaceAll(":", "")}`;
  // The revision fence prevents a removed/hidden target from reviving on a later result.
  const [focus, setFocus] = useState<{
    session: typeof session;
    revision: number;
    projection: typeof view.fold;
    key: string;
  } | null>(null);
  useLayoutEffect(() => {
    setFocus(null);
  }, [session, state.revision, view.fold]);
  const descriptors: readonly Descriptor[] = useMemo(
    () => result && projection ? [...projection.nodes, ...projection.edges] : [],
    [result, projection],
  );
  const focused =
    focus?.session === session &&
    focus.revision === state.revision &&
    focus.projection === view.fold
      ? descriptors.find((d) => keyOf(d) === focus.key)
      : undefined;
  const annotationFor = indexAnnotations(resolveObjectAnnotations(
    state.snapshotId,
    descriptors.flatMap((descriptor) => descriptor.items.map((item) => item.ref)),
    annotations,
  ));
  const describeAnnotations = createAnnotationDescriptions();
  const tabKey = focused ? keyOf(focused) : descriptors[0] ? keyOf(descriptors[0]) : null;
  // Results are immutable. Retain only the current frame's derived lookup references.
  const { nodes, edges } = useMemo(() => ({
    nodes: new Map(result?.nodes.map((node) => [String(node.id), node])),
    edges: new Map(result?.edges.map((edge) => [String(edge.id), edge])),
  }), [result]);
  function keyDown(event: KeyboardEvent<SVGGElement>, descriptor: Descriptor, index: number): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      view.invoke("select", descriptor.target);
      return;
    }
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = Math.min(descriptors.length - 1, index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = Math.max(0, index - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = descriptors.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    group.current?.querySelectorAll<SVGGElement>('[role="button"]')[next]?.focus();
  }
  return (
    <section
      className={`hier-schematic-view${props.className ? ` ${props.className}` : ""}`}
      aria-label={props.ariaLabel}
    >
      <header className="hier-schematic-view__toolbar">
        <h2>原理图</h2>
        <button type="button" disabled={!view.canLayout} onClick={() => view.invoke("layout")}>
          布局
        </button>
        <button type="button" disabled={!view.canRetry} onClick={() => view.invoke("retry")}>
          重试
        </button>
        <button type="button" disabled={!view.canCancel} onClick={() => view.invoke("cancel")}>
          取消
        </button>
      </header>
      {view.fold && view.fold.options.groups.length > 0 && (
        <section className="hier-schematic-view__folds" aria-label="折叠分组">
          {view.fold.options.groups.map((foldGroup) => {
            const expanded = !view.fold!.options.collapsed.includes(foldGroup.key);
            return (
              <div key={foldGroup.key}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  disabled={!view.canFold}
                  onClick={() => view.invoke("fold", undefined, foldGroup.key)}
                >
                  {expanded ? "折叠" : "展开"} {foldGroup.kind} {foldGroup.label} ({foldGroup.key})
                </button>
                <span>
                  成员:{" "}
                  {foldGroup.kind === "hierarchy" ? foldGroup.nodes.length : foldGroup.edges.length}
                </span>
              </div>
            );
          })}
        </section>
      )}
      <div role="status" aria-live="polite">
        <div>{view.disposed ? "disposed" : layout.status}</div>
        {layout.error && (
          <div>
            {layout.error.code} · {layout.error.origin}: {layout.error.message}
          </div>
        )}
        {view.failed && <div>操作失败</div>}
        {state.nodes.length === 0 && state.edges.length === 0 && <div>当前图无成员</div>}
        {!view.disposed && view.staleProjection ? (
          <div>图已改变，更新折叠投影</div>
        ) : (
          !view.disposed &&
          layout.result &&
          !result && <div>{view.fold ? "折叠状态已改变，重新布局" : "图已改变，重新布局"}</div>
        )}
        {result && !selectable && <div>旧布局，暂不可选择</div>}
      </div>
      <div className="hier-schematic-view__canvas" style={{ height: props.height }}>
        <svg
          ref={group}
          role="group"
          aria-label={props.ariaLabel}
          tabIndex={0}
          width={Math.max(1, result?.width ?? 1)}
          height={Math.max(1, result?.height ?? 1)}
          data-direction={result?.direction}
          data-readonly={!selectable}
        >
          <defs>
            <marker
              id={marker}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>
          {descriptors.map((descriptor, index) => {
            const marks = annotationFor(descriptor.items.map((item) => item.ref));
            const description = describeAnnotations(marks);
            const key = keyOf(descriptor),
              node =
                descriptor.target.kind === "node" ? nodes.get(descriptor.target.id) : undefined,
              edge =
                descriptor.target.kind === "edge" ? edges.get(descriptor.target.id) : undefined;
            const pressed =
              descriptor.items.length > 0 &&
              descriptor.items.every(matchesSelection);
            return (
              <GraphItem
                key={`${result!.taskId}:${key}`}
                descriptor={descriptor}
                annotationDescription={description}
                isCurrentFrame={view.isCurrentFrame}
                group={group}
                pressed={pressed}
                disabled={!selectable || !descriptor.items.length}
                tabIndex={tabKey === key ? 0 : -1}
                onFocus={() =>
                  setFocus({
                    session,
                    revision: state.revision,
                    projection: view.fold,
                    key,
                  })
                }
                onActivate={() => view.invoke("select", descriptor.target)}
                onKeyDown={(event) => keyDown(event, descriptor, index)}
              >
                <title>
                  {description === undefined
                    ? descriptor.label
                    : `${descriptor.label}\n${description}`}
                </title>
                <SchematicGeometry
                  node={node}
                  edge={edge}
                  label={descriptor.label}
                  marker={marker}
                />
                <GraphAnnotations
                  matches={marks}
                  x={node ? node.x + 8 : (edge?.sections[0]?.[0]?.x ?? 0)}
                  y={node ? node.y + node.height - 20 : (edge?.sections[0]?.[0]?.y ?? 0) + 3}
                  width={node ? node.width - 16 : 200}
                />
              </GraphItem>
            );
          })}
        </svg>
      </div>
      <div className="hier-schematic-view__information">
        <SchematicSources state={state} />
        <SchematicDetails state={state} descriptor={focused} />
        <AnnotationDetails
          matches={annotationFor(focused?.items.map((item) => item.ref) ?? [])}
        />
      </div>
    </section>
  );
}

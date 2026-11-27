import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import {
  SelectionModel,
  SourceNavigationModel,
  type SourceCandidateAction,
} from "@hier/viewmodel";
import {
  useCandidateCommands,
  type CandidateRow,
} from "./source-candidates-commands.js";
import type { SourceCandidatesViewProps } from "./source-candidates-types.js";

// Calling the original private-field getters rejects forged prototypes and
// proxies without consulting caller-supplied methods or adding a second brand.
const navigationDisposed = Object.getOwnPropertyDescriptor(
  SourceNavigationModel.prototype,
  "disposed",
)!.get!;
const navigationSnapshot = Object.getOwnPropertyDescriptor(
  SourceNavigationModel.prototype,
  "snapshotId",
)!.get!;
const selectionDisposed = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "disposed",
)!.get!;
const selectionSnapshot = Object.getOwnPropertyDescriptor(
  SelectionModel.prototype,
  "snapshotId",
)!.get!;

function validate(props: SourceCandidatesViewProps): void {
  if (typeof props.ariaLabel !== "string" || !props.ariaLabel.trim())
    throw new TypeError(
      "SourceCandidatesView ariaLabel must be a nonblank string",
    );
  if (
    typeof props.height !== "number" ||
    !Number.isFinite(props.height) ||
    props.height <= 0
  )
    throw new TypeError(
      "SourceCandidatesView height must be finite and positive",
    );
  if (Object.hasOwn(props, "className") && typeof props.className !== "string")
    throw new TypeError(
      "SourceCandidatesView className must be a string when provided",
    );
  if (typeof props.onCommandError !== "function")
    throw new TypeError(
      "SourceCandidatesView onCommandError must be a function",
    );
  if (navigationDisposed.call(props.navigation))
    throw new TypeError("SourceCandidatesView navigation must be live");
  if (selectionDisposed.call(props.selection))
    throw new TypeError("SourceCandidatesView selection must be live");
  if (
    selectionSnapshot.call(props.selection) !==
    navigationSnapshot.call(props.navigation)
  )
    throw new TypeError("SourceCandidatesView models must share a snapshot");
}

function modified(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
}

/** Reveal in the list's own coordinate system; never scroll an ancestor. */
function reveal(list: HTMLUListElement, button: HTMLButtonElement): void {
  const port = list.getBoundingClientRect();
  const box = button.getBoundingClientRect();
  const scaleX = list.offsetWidth ? port.width / list.offsetWidth : 1;
  const scaleY = list.offsetHeight ? port.height / list.offsetHeight : 1;
  const top = (box.top - port.top) / scaleY - list.clientTop;
  const left = (box.left - port.left) / scaleX - list.clientLeft;
  if (top < 0) list.scrollTop += top;
  else if (top + box.height / scaleY > list.clientHeight)
    list.scrollTop += top + box.height / scaleY - list.clientHeight;
  if (left < 0) list.scrollLeft += left;
  else if (left + box.width / scaleX > list.clientWidth)
    list.scrollLeft += left + box.width / scaleX - list.clientWidth;
}

export function SourceCandidatesView(
  props: SourceCandidatesViewProps,
): ReactElement {
  validate(props);
  const view = useCandidateCommands(props);
  const { session, state, rows, actions } = view;
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const buttons = useRef(new Map<CandidateRow, HTMLButtonElement>());
  const [focused, setFocused] = useState<CandidateRow | null>(null);
  const focusOwner = useRef<HTMLButtonElement | null>(null);
  const lastSession = useRef(session);
  const pointer = useRef<{
    pointerId: number;
    binding: {
      session: typeof session;
      row: CandidateRow;
      action: SourceCandidateAction | null;
    } | null;
  } | null>(null);
  const remembered = rows.includes(focused!) ? focused : (rows[0] ?? null);

  useLayoutEffect(() => {
    const port = list.current;
    if (!port) return;
    if (lastSession.current !== session) {
      lastSession.current = session;
      focusOwner.current = null;
      setFocused(null);
      port.scrollTop = 0;
      port.scrollLeft = 0;
      // Retain the old gesture's identity, without retaining borrowed models.
      // Only its paired click must be suppressed, not independent activation.
      if (pointer.current) pointer.current.binding = null;
    } else if (focusOwner.current && !focusOwner.current.isConnected) {
      if (port.ownerDocument.activeElement === port.ownerDocument.body)
        port.focus({ preventScroll: true });
      focusOwner.current = null;
      setFocused(null);
    }
    if (focused && !rows.includes(focused)) setFocused(null);
    if (pointer.current?.binding && !rows.includes(pointer.current.binding.row))
      pointer.current.binding = null;
  });
  useLayoutEffect(
    () => () => {
      pointer.current = null;
      focusOwner.current = null;
    },
    [],
  );

  function keydown(
    event: KeyboardEvent<HTMLElement>,
    row: CandidateRow | null,
    action: SourceCandidateAction | null,
  ): void {
    if (modified(event)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat && !event.nativeEvent.isComposing && action)
        view.confirm(action);
      return;
    }
    if (event.nativeEvent.isComposing) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (!rows.length) return;
    event.preventDefault();
    const index = row ? rows.indexOf(row) : -1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : index < 0
            ? 0
            : Math.max(
                0,
                Math.min(
                  rows.length - 1,
                  index + (event.key === "ArrowDown" ? 1 : -1),
                ),
              );
    const target = rows[next]!;
    const button = buttons.current.get(target);
    if (button && list.current) {
      button.focus({ preventScroll: true });
      reveal(list.current, button);
    }
  }

  const candidates = state.candidates?.state;
  const pages = candidates?.pages ?? [];
  const partial = pages.some((page) => page.completeness.status === "partial");
  const pending = candidates?.status === "pending";
  const canMore =
    candidates?.status === "success" &&
    pages.length > 0 &&
    !partial &&
    pages[pages.length - 1]!.result.next !== undefined;
  const status = !candidates
    ? "尚未查询源码位置"
    : pending
      ? "正在查询候选"
      : candidates.status === "failed"
        ? "候选查询失败"
        : candidates.status === "cancelled"
          ? "候选查询已取消"
          : rows.length
            ? `已加载 ${rows.length} 个候选`
            : partial
              ? "当前结果未找到候选"
              : "未找到候选";
  return (
    <section
      id={`${id}-region`}
      role="region"
      aria-label={props.ariaLabel}
      aria-busy={pending}
      className={`hier-source-candidates-view${props.className ? ` ${props.className}` : ""}`}
      style={{
        height: props.height,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        role="status"
        aria-live="polite"
        className="hier-source-candidates-view__status"
        style={{ flex: "0 0 5em", overflow: "auto" }}
      >
        <div id={`${id}-status`}>{status}</div>
        {candidates &&
          (candidates.status === "failed" ||
            candidates.status === "cancelled") && (
            <div>
              {candidates.error.origin} / {candidates.error.code}:{" "}
              {candidates.error.message}
            </div>
          )}
        {partial && <div>结果不完整</div>}
        {pages.map(
          (page, pageIndex) =>
            page.completeness.status === "partial" && (
              <div key={pageIndex}>
                {page.completeness.reasons.map((reason, index) => (
                  <div key={index}>
                    {reason.code}
                    {reason.at !== undefined && <> {reason.at}</>}
                    {reason.detail !== undefined && <> {reason.detail}</>}
                  </div>
                ))}
              </div>
            ),
        )}
        <div id={`${id}-binding`}>
          {view.preparing
            ? "正在准备候选操作"
            : "候选操作需当前查询成功并具有地址类型"}
        </div>
        {view.failed && <div id={`${id}-feedback`}>候选操作未正常完成</div>}
      </div>
      <ul
        id={`${id}-list`}
        ref={list}
        tabIndex={rows.length ? -1 : 0}
        aria-label={`${props.ariaLabel}候选列表`}
        aria-describedby={`${id}-status`}
        className="hier-source-candidates-view__list"
        style={{
          position: "relative",
          flex: "1 1 0",
          minHeight: 0,
          minWidth: 0,
          margin: 0,
          padding: 0,
          overflow: "auto",
          overflowAnchor: "none",
          whiteSpace: "pre",
          listStyle: "none",
        }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget) keydown(event, null, null);
        }}
        onBlurCapture={(event) => {
          if (
            event.relatedTarget &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            focusOwner.current = null;
        }}
      >
        {rows.map((row) => {
          const hit = row.page.result.items[row.itemIndex]!;
          const action =
            hit.refKind === undefined ? null : (actions?.get(row) ?? null);
          return (
            <li key={row.key}>
              <button
                type="button"
                id={`${id}-row-${row.key}`}
                ref={(element) => {
                  if (element) buttons.current.set(row, element);
                  else buttons.current.delete(row);
                }}
                tabIndex={row === remembered ? 0 : -1}
                aria-disabled={action === null}
                aria-describedby={
                  hit.refKind === undefined
                    ? `${id}-address-${row.key}`
                    : action === null
                      ? `${id}-binding`
                      : undefined
                }
                className="hier-source-candidates-view__row"
                style={{
                  display: "block",
                  minWidth: "100%",
                  width: "max-content",
                  whiteSpace: "pre",
                  textAlign: "left",
                }}
                onFocus={(event) => {
                  focusOwner.current = event.currentTarget;
                  setFocused(row);
                }}
                onKeyDown={(event) => keydown(event, row, action)}
                onPointerDown={(event) => {
                  pointer.current = {
                    pointerId: event.pointerId,
                    binding: {
                      session,
                      row,
                      action:
                        event.button === 0 &&
                        event.isPrimary &&
                        !modified(event)
                          ? action
                          : null,
                    },
                  };
                }}
                onPointerCancel={(event) => {
                  if (pointer.current?.pointerId === event.pointerId)
                    pointer.current = null;
                }}
                onClick={(event) => {
                  const captured = pointer.current;
                  // A no-down activation (including HTMLElement.click()) is
                  // independent of an unfinished pointer gesture. Keep that
                  // gesture until its own click, cancellation or replacement.
                  // Older MouseEvent-only clicks have no pointer identity;
                  // their nonzero click count distinguishes pointer input.
                  const paired =
                    captured !== null &&
                    ("pointerId" in event.nativeEvent
                      ? event.nativeEvent.pointerId === captured.pointerId
                      : event.detail > 0);
                  if (paired) pointer.current = null;
                  if (event.button !== 0 || modified(event)) return;
                  if (paired) {
                    const binding = captured.binding;
                    if (
                      binding?.session === session &&
                      binding.row === row &&
                      binding.action
                    )
                      view.confirm(binding.action);
                  } else if (action) view.confirm(action);
                }}
              >
                {hit.ref} · {hit.kind} · {hit.span.file} {hit.span.start.line}:
                {hit.span.start.column}–{hit.span.end.line}:
                {hit.span.end.column}
                {hit.inst !== undefined && <> · {hit.inst}</>} ·{" "}
                <span id={`${id}-address-${row.key}`}>
                  {hit.refKind === "definition"
                    ? "定义"
                    : hit.refKind === "object"
                      ? "对象"
                      : "地址类型不可用"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {candidates && (
        <div
          className="hier-source-candidates-view__operations"
          style={{ flex: "0 0 auto" }}
        >
          <button
            type="button"
            disabled={!canMore}
            onClick={() => {
              if (canMore) view.command("loadMore");
            }}
          >
            加载更多
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!pending) view.command("reloadCandidates");
            }}
          >
            重新查询
          </button>
          <button
            type="button"
            disabled={!pending}
            onClick={() => {
              if (pending) view.command("cancelCandidates");
            }}
          >
            取消查询
          </button>
        </div>
      )}
    </section>
  );
}

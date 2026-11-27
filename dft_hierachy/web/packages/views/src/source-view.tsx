import {
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { SourceDocument, SourceDocumentState } from "@hier/viewmodel";
import {
  readPositionQuery,
  useSourcePositionQuery,
  type SourceViewPositionQuery,
} from "./source-position-query.js";
export type {
  SourceViewPositionQuery,
  SourceViewPositionFailure,
} from "./source-position-query.js";

/** Controlled source presentation. The host owns models and subscriptions. */
export interface SourceViewProps {
  readonly state: SourceDocumentState;
  readonly ariaLabel: string;
  /** Finite, positive height of the whole component in CSS pixels. */
  readonly height: number;
  /** Omission is allowed; an explicit undefined is not a string. */
  readonly className?: string;
  /** Omit for read-only presentation. The host owns the command receiver. */
  readonly positionQuery?: SourceViewPositionQuery;
}

const bodyStyle: CSSProperties = {
  position: "relative",
  margin: 0,
  padding: 8,
  boxSizing: "border-box",
  flex: "1 1 0",
  minWidth: 0,
  minHeight: 0,
  overflowX: "auto",
  overflowY: "auto",
  overflowAnchor: "none",
  whiteSpace: "pre",
};

// A textless inline box makes even an empty file or a trailing-newline EOF
// measurable. It contributes no code units to textContent or native copying.
const anchorStyle: CSSProperties = {
  display: "inline-block",
  width: 0,
  height: "1em",
  verticalAlign: "text-bottom",
  pointerEvents: "none",
};

/** Reveal only this viewport. Never move ancestors, focus or native Selection. */
function revealStart(body: HTMLPreElement, anchor: HTMLSpanElement): void {
  // The positioned body is the anchor's offsetParent. These coordinates and
  // scroll offsets use the same local CSS pixels, even in a scaled host.
  // Leave room around the boundary for rounded offsets and the text line box.
  const above = Math.max(0, (body.clientHeight - anchor.offsetHeight) / 2);
  body.scrollTop = anchor.offsetTop - above;
  body.scrollLeft = anchor.offsetLeft - body.clientWidth / 2;
}

export function SourceView(props: SourceViewProps): ReactElement {
  const ariaLabel = props.ariaLabel;
  if (typeof ariaLabel !== "string" || ariaLabel.trim().length === 0)
    throw new TypeError("SourceView ariaLabel must be a nonblank string");
  const height = props.height;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0)
    throw new TypeError("SourceView height must be a finite positive number");
  const className = props.className;
  if (Object.hasOwn(props, "className") && typeof className !== "string")
    throw new TypeError("SourceView className must be a string when provided");
  const config = Object.hasOwn(props, "positionQuery")
    ? readPositionQuery(props.positionQuery)
    : null;

  const { state } = props;
  const descriptionId = useId();
  const instructionId = useId();
  const feedbackId = useId();
  const mouseHintId = useId();
  const bodyRef = useRef<HTMLPreElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const position = useSourcePositionQuery(
    state.status === "success" && state.data.location.status === "exact"
      ? state.data
      : null,
    config,
    codeRef,
  );
  const displayed = useRef<{
    document: SourceDocument;
    positioned: boolean;
  } | null>(null);

  // Run on every commit: a hidden mount can become measurable without changing
  // its document. Update bookkeeping here, never in an uncommitted render.
  useLayoutEffect(() => {
    if (state.status !== "success") {
      displayed.current = null;
      return;
    }
    if (displayed.current?.document !== state.data)
      displayed.current = { document: state.data, positioned: false };
    if (displayed.current.positioned) return;
    const body = bodyRef.current;
    if (!body || body.clientWidth === 0 || body.clientHeight === 0) return;
    if (state.data.location.status === "changed") {
      body.scrollTop = 0;
      body.scrollLeft = 0;
    } else {
      const anchor = anchorRef.current;
      if (!anchor) return;
      revealStart(body, anchor);
    }
    displayed.current.positioned = true;
  });

  let status: ReactElement;
  let body: ReactElement | null = null;
  switch (state.status) {
    case "idle":
      status = <span>未选择源码</span>;
      break;
    case "pending":
      status = <span>正在加载源码</span>;
      break;
    case "failed":
    case "cancelled":
      status = (
        <>
          <span>
            {state.status === "failed" ? "源码加载失败" : "源码加载已取消"}
          </span>
          <span className="hier-source-view__error">
            {state.error.origin} / {state.error.code}: {state.error.message}
          </span>
        </>
      );
      break;
    case "success": {
      const { location } = state.data;
      const text = state.data.content.result.text;
      let content: ReactElement | string = text;
      if (location.status === "changed") {
        status = (
          <span id={descriptionId} className="hier-source-view__warning">
            源码已变化，位置可能不准
          </span>
        );
      } else {
        const { start, end } = location.range;
        const empty = start.offset === end.offset;
        status = (
          <span id={descriptionId}>
            {empty
              ? `空范围：第 ${start.line} 行，第 ${start.column} 列`
              : `位置：第 ${start.line} 行，第 ${start.column} 列 至 第 ${end.line} 行，第 ${end.column} 列`}
          </span>
        );
        content = (
          <>
            {text.slice(0, start.offset)}
            <span ref={anchorRef} aria-hidden="true" style={anchorStyle} />
            {!empty && <mark>{text.slice(start.offset, end.offset)}</mark>}
            {text.slice(end.offset)}
          </>
        );
      }
      body = (
        <pre
          ref={bodyRef}
          tabIndex={0}
          aria-describedby={[
            descriptionId,
            ...(position.enabled ? [instructionId] : []),
            ...(position.failed ? [feedbackId] : []),
            ...(position.mouseUnavailable ? [mouseHintId] : []),
          ].join(" ")}
          aria-keyshortcuts={position.enabled ? "Alt+Enter" : undefined}
          onKeyDown={position.enabled ? position.onKeyDown : undefined}
          onDoubleClick={position.enabled ? position.onDoubleClick : undefined}
          className="hier-source-view__body"
          style={bodyStyle}
        >
          <code ref={codeRef}>{content}</code>
        </pre>
      );
      break;
    }
  }

  return (
    <section
      role="region"
      aria-label={ariaLabel}
      aria-busy={state.status === "pending"}
      className={`hier-source-view${className ? ` ${className}` : ""}`}
      style={{
        height,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        role="status"
        className="hier-source-view__status"
        style={{ flex: "0 0 auto" }}
      >
        {status}
        {position.enabled && (
          <div id={instructionId}>
            查询此处对象：双击源码，或在源码选区处按 Alt+Enter
          </div>
        )}
        {position.enabled && (
          // Reserve local feedback space so appearing/clearing hints cannot
          // move or resize the document viewport (including at its scroll end).
          <div style={{ height: "3em", overflow: "auto" }}>
            {position.failed && <div id={feedbackId}>源码位置查询失败</div>}
            {position.mouseUnavailable && (
              <div id={mouseHintId}>
                无法从鼠标位置查询，请选中文本后按 Alt+Enter
              </div>
            )}
          </div>
        )}
      </div>
      {body}
    </section>
  );
}

import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import type { SourceDocument } from "@hier/viewmodel";
import { captureSourceDom } from "./source-dom-boundary.js";

export interface SourceViewPositionFailure {
  readonly document: SourceDocument;
  readonly utf16Offset: number;
  readonly error: unknown;
}

export interface SourceViewPositionQuery {
  readonly locate: (
    document: SourceDocument,
    utf16Offset: number,
  ) => Promise<void>;
  readonly onError: (failure: SourceViewPositionFailure) => void;
}

interface Configuration {
  readonly identity: SourceViewPositionQuery;
  readonly locate: SourceViewPositionQuery["locate"];
  readonly onError: SourceViewPositionQuery["onError"];
}

/** Read just the two callbacks, once per render, after the old prop checks. */
export function readPositionQuery(value: unknown): Configuration {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("SourceView positionQuery must be an object");
  const { locate, onError } = value as SourceViewPositionQuery;
  if (typeof locate !== "function" || typeof onError !== "function")
    throw new TypeError(
      "SourceView positionQuery requires locate and onError functions",
    );
  return { identity: value as SourceViewPositionQuery, locate, onError };
}

interface Session {
  readonly config: Configuration;
  readonly document: SourceDocument;
  readonly code: HTMLElement;
  readonly boundary: ReturnType<typeof captureSourceDom>;
  action: object | null;
}
interface Feedback {
  readonly session: Session;
  readonly action: object | null;
  readonly mouse: boolean;
  readonly failure: boolean;
  readonly renderError?: AggregateError;
}

// Invoke the captured then immediately, even after a synchronous unmount.
// Native resolving functions supply first-settlement wins and recursive
// assimilation without a second read of the original value's then property.
function observeCommand(
  value: unknown,
  failed: (error: unknown) => void,
): void {
  const observed = new Promise<unknown>((resolve, reject) => {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    )
      throw new TypeError(
        "SourceView locate must return a Promise or thenable",
      );
    const then = (value as { then?: unknown }).then;
    if (typeof then !== "function")
      throw new TypeError(
        "SourceView locate must return a Promise or thenable",
      );
    Reflect.apply(then, value, [resolve, reject]);
  });
  // failed never throws; callback exceptions are routed to the render boundary.
  void observed.then(undefined, failed);
}

/** Owns only DOM command feedback; models and their cancellation stay with the host. */
export function useSourcePositionQuery(
  document: SourceDocument | null,
  config: Configuration | null,
  codeRef: RefObject<HTMLElement>,
) {
  const committed = useRef<Session | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const enabled = document !== null && config !== null;

  useLayoutEffect(() => {
    const code = codeRef.current;
    const old = committed.current;
    if (!document || !config || !code) {
      committed.current = null;
      if (old) setFeedback(null);
    } else if (
      old?.document !== document ||
      old.config.identity !== config.identity ||
      old.code !== code
    ) {
      committed.current = {
        config,
        document,
        code,
        boundary: captureSourceDom(code),
        action: null,
      };
      setFeedback(null);
    }
  });
  useLayoutEffect(
    () => () => {
      committed.current = null;
    },
    [],
  );

  function current(session: Session, action: object | null): boolean {
    return committed.current === session && session.action === action;
  }
  function query(session: Session, utf16Offset: number): void {
    const action = {};
    session.action = action;
    setFeedback(null);
    const { locate, onError } = session.config;
    const publishFailure = (renderError?: AggregateError): void => {
      setFeedback((previous) => ({
        session,
        action,
        mouse:
          previous?.session === session &&
          previous.action === action &&
          previous.mouse,
        failure: true,
        ...(renderError ? { renderError } : {}),
      }));
    };
    const failed = (error: unknown): void => {
      if (!current(session, action)) return;
      publishFailure();
      try {
        onError(
          Object.freeze({ document: session.document, utf16Offset, error }),
        );
      } catch (callbackError) {
        if (current(session, action))
          publishFailure(new AggregateError([error, callbackError]));
      }
    };
    try {
      const result = locate(session.document, utf16Offset);
      observeCommand(result, failed);
    } catch (error) {
      queueMicrotask(() => failed(error));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLPreElement>): void {
    const session = committed.current;
    if (
      !session ||
      event.target !== event.currentTarget ||
      event.key !== "Enter" ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.repeat ||
      event.nativeEvent.isComposing
    )
      return;
    const selection = session.code.ownerDocument.getSelection();
    if (!selection || selection.rangeCount !== 1) return;
    if (
      session.boundary(selection.anchorNode, selection.anchorOffset) ===
      undefined
    )
      return;
    const offset = session.boundary(selection.focusNode, selection.focusOffset);
    if (offset === undefined) return;
    event.preventDefault();
    query(session, offset);
  }

  function onDoubleClick(event: MouseEvent<HTMLPreElement>): void {
    const session = committed.current;
    if (
      !session ||
      !session.code.isConnected ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !session.code.contains(event.target as Node)
    )
      return;
    const owner = session.code.ownerDocument;
    let node: Node | null;
    let offset: number;
    if (typeof owner.caretPositionFromPoint === "function") {
      const caret = owner.caretPositionFromPoint(event.clientX, event.clientY);
      if (!caret) return;
      node = caret.offsetNode;
      offset = caret.offset;
    } else if (typeof owner.caretRangeFromPoint === "function") {
      const range = owner.caretRangeFromPoint(event.clientX, event.clientY);
      if (!range) return;
      node = range.startContainer;
      offset = range.startOffset;
    } else {
      const action = session.action;
      setFeedback((previous) =>
        previous?.session === session && previous.action === action
          ? { ...previous, mouse: true }
          : { session, action, mouse: true, failure: false },
      );
      return;
    }
    const utf16Offset = session.boundary(node, offset);
    if (utf16Offset !== undefined) query(session, utf16Offset);
  }

  const visible =
    feedback &&
    feedback.session.document === document &&
    feedback.session.config.identity === config?.identity &&
    current(feedback.session, feedback.action)
      ? feedback
      : null;
  if (visible?.renderError) throw visible.renderError;
  return {
    enabled,
    onKeyDown,
    onDoubleClick,
    failed: visible?.failure === true,
    mouseUnavailable: visible?.mouse === true,
  };
}

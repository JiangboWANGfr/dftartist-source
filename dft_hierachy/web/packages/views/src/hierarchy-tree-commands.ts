import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RowId } from "@hier/viewmodel";
import type {
  HierarchyTreeProps,
  TreeViewCommand,
  TreeViewCommandFailure,
} from "./hierarchy-tree-types.js";

/** Consume the original command promise, including after this view is gone. */
export function useTreeCommands(props: HierarchyTreeProps) {
  const { tree, selection, onCommandError } = props;
  const session = useMemo(() => ({}), [tree, selection]);
  const committed = useRef<object | null>(null);
  const [feedback, setFeedback] = useState<{
    session: object;
    renderError?: AggregateError;
  } | null>(null);
  useLayoutEffect(() => {
    committed.current = session;
    setFeedback(null);
    return () => {
      committed.current = null;
    };
  }, [session]);

  function run(
    command: TreeViewCommand,
    rowId: RowId,
    invoke: () => void | Promise<void>,
  ): void {
    if (committed.current !== session) return;
    setFeedback(null);
    const fail = (error: unknown) => {
      if (committed.current !== session) return;
      const failure: TreeViewCommandFailure = Object.freeze({
        command,
        rowId,
        error,
      });
      let next: NonNullable<typeof feedback> = { session };
      try {
        onCommandError?.(failure);
      } catch (callbackError) {
        next = {
          session,
          renderError: new AggregateError(
            [error, callbackError],
            "HierarchyTree command feedback failed",
          ),
        };
      }
      // The callback may synchronously unmount or replace the borrowed models.
      if (committed.current === session) setFeedback(next);
    };
    try {
      const pending = invoke();
      if (pending !== undefined) pending.then(() => {}, fail);
    } catch (error) {
      queueMicrotask(() => fail(error));
    }
  }

  if (feedback?.session === session && feedback.renderError)
    throw feedback.renderError;
  return { session, run, failed: feedback?.session === session };
}

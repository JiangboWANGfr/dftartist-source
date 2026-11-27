import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  SourceCandidateAction,
  SourceCandidatesPage,
  SourceNavigationCandidates,
  SourceNavigationState,
} from "@hier/viewmodel";
import type {
  SourceCandidatesViewCommand,
  SourceCandidatesViewProps,
} from "./source-candidates-types.js";

export interface CandidateRow {
  readonly page: SourceCandidatesPage;
  readonly itemIndex: number;
  readonly key: number;
}

function sameBinding(
  a: SourceNavigationCandidates | null,
  b: SourceNavigationCandidates | null,
): boolean {
  return a?.document === b?.document && a?.utf16Offset === b?.utf16Offset;
}

/** Only committed presentations may issue commands or receive local feedback. */
export function useCandidateCommands(props: SourceCandidatesViewProps) {
  const { navigation, selection, onCommandError } = props;
  const subscribe = useCallback(
    (notify: () => void) => navigation.subscribe(notify),
    [navigation],
  );
  const snapshot = useCallback(() => navigation.state, [navigation]);
  const state = useSyncExternalStore(subscribe, snapshot);
  const nextRowKey = useRef(0);
  const session = useMemo(
    () => ({
      navigation,
      selection,
      operation: null as object | null,
      pages: new WeakMap<SourceCandidatesPage, readonly CandidateRow[]>(),
    }),
    [navigation, selection],
  );
  const rows = useMemo(() => {
    return (state.candidates?.state.pages ?? []).flatMap((page) => {
      let items = session.pages.get(page);
      if (!items) {
        items = page.result.items.map((_, itemIndex) => ({
          page,
          itemIndex,
          key: nextRowKey.current++,
        }));
        session.pages.set(page, items);
      }
      return items;
    });
  }, [session, state]);
  const committed = useRef<{
    session: typeof session;
    state: SourceNavigationState;
    onCommandError: typeof onCommandError;
  } | null>(null);
  const [bindings, setBindings] = useState<{
    session: typeof session;
    state: SourceNavigationState;
    actions: ReadonlyMap<CandidateRow, SourceCandidateAction>;
  } | null>(null);
  type Operation = {
    session: typeof session;
    binding: SourceNavigationCandidates | null;
    callback: typeof onCommandError;
    command: SourceCandidatesViewCommand;
    action: SourceCandidateAction | null;
  };
  const [feedback, setFeedback] = useState<{
    operation: Operation;
    renderError?: AggregateError;
  } | null>(null);

  useLayoutEffect(() => {
    const old = committed.current;
    if (
      old?.session !== session ||
      old.onCommandError !== onCommandError ||
      !sameBinding(old.state.candidates, state.candidates)
    ) {
      if (old) old.session.operation = null;
      session.operation = null;
      setFeedback(null);
    }
    committed.current = { session, state, onCommandError };
  });
  useLayoutEffect(
    () => () => {
      session.operation = null;
      committed.current = null;
    },
    [session],
  );

  function valid(operation: Operation): boolean {
    const current = committed.current;
    return (
      current?.session === operation.session &&
      current.onCommandError === operation.callback &&
      operation.session.operation === operation &&
      sameBinding(operation.binding, current.state.candidates) &&
      sameBinding(
        operation.binding,
        operation.session.navigation.state.candidates,
      )
    );
  }
  function start(
    command: SourceCandidatesViewCommand,
    action: SourceCandidateAction | null,
  ): Operation {
    const operation = {
      session,
      binding: state.candidates,
      callback: onCommandError,
      command,
      action,
    };
    session.operation = operation;
    setFeedback(null);
    return operation;
  }
  function fail(operation: Operation, error: unknown): void {
    queueMicrotask(() => {
      if (!valid(operation)) return;
      setFeedback({ operation });
      try {
        operation.callback(
          Object.freeze({
            command: operation.command,
            action: operation.action,
            error,
          }),
        );
      } catch (callbackError) {
        if (valid(operation))
          setFeedback({
            operation,
            renderError: new AggregateError([error, callbackError]),
          });
      }
    });
  }

  const eligible =
    state.document.status === "success" &&
    state.document.data.location.status === "exact" &&
    state.document.data === state.candidates?.document &&
    state.candidates.state.status === "success";
  useLayoutEffect(() => {
    let active = true;
    setBindings(null);
    if (eligible) {
      queueMicrotask(() => {
        if (
          !active ||
          committed.current?.session !== session ||
          committed.current.state !== state ||
          navigation.state !== state
        )
          return;
        const actions = new Map<CandidateRow, SourceCandidateAction>();
        if (rows.length) {
          const operation = start("bindActions", null);
          try {
            for (const row of rows)
              actions.set(
                row,
                navigation.createCandidateAction(row.page, row.itemIndex),
              );
          } catch (error) {
            actions.clear();
            fail(operation, error);
          }
        }
        setBindings({ session, state, actions });
      });
    }
    return () => {
      active = false;
    };
    // Local feedback and focus renders must not issue another batch. Callback
    // identity changes invalidate feedback, but do not reissue row actions.
  }, [session, state]);

  function confirm(action: SourceCandidateAction): void {
    if (committed.current?.session !== session) return;
    const operation = start("confirm", action);
    try {
      navigation.confirmCandidate(action, selection);
    } catch (error) {
      fail(operation, error);
    }
  }
  function command(
    name: "loadMore" | "reloadCandidates" | "cancelCandidates",
  ): void {
    if (committed.current?.session !== session) return;
    const operation = start(name, null);
    try {
      const original = navigation[name]();
      // Observe the ORIGINAL returned promise immediately, including after a
      // command synchronously unmounts this view. Both handlers never throw.
      void original.then(
        () => {},
        (error: unknown) => fail(operation, error),
      );
    } catch (error) {
      fail(operation, error);
    }
  }
  const currentBindings =
    eligible && bindings?.session === session && bindings.state === state
      ? bindings.actions
      : null;
  const visible =
    feedback &&
    feedback.operation.session === session &&
    feedback.operation.callback === onCommandError &&
    sameBinding(feedback.operation.binding, state.candidates) &&
    valid(feedback.operation)
      ? feedback
      : null;
  if (visible?.renderError) throw visible.renderError;
  return {
    session,
    state,
    rows,
    actions: currentBindings,
    preparing: eligible && currentBindings === null && rows.length > 0,
    failed: visible !== null,
    confirm,
    command,
  };
}

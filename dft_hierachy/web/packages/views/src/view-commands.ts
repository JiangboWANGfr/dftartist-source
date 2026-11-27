import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SelectionModel } from "@hier/viewmodel";

export interface ViewCommandModel<State> {
  readonly state: State;
  readonly disposed: boolean;
  subscribe(listener: () => void): () => void;
}

/** Shared borrowed-store and command feedback lifetime; no query data ownership. */
export function useViewCommands<Target, State, Action, Failure>(
  model: ViewCommandModel<State>,
  selection: SelectionModel,
  onCommandError: ((failure: Failure) => void) | undefined,
  readTarget: (state: State) => Target | null,
  permits: (state: State, action: Action) => boolean,
  execute: (action: Action) => void | Promise<void>,
  commandFailure: (action: Action, target: Target, error: unknown) => Failure,
) {
  const session = useMemo(
    () => ({
      model,
      selection,
      target: readTarget(model.state),
      epoch: 0,
      operation: null as object | null,
    }),
    [model, selection],
  );
  const subscribeModel = useCallback(
    (notify: () => void) => {
      const observeTarget = () => {
        const target = readTarget(model.state);
        if (session.target !== target) {
          session.target = target;
          session.epoch++;
          session.operation = null;
        }
      };
      observeTarget();
      return model.subscribe(() => {
        // Observe every publication, including A→B→A within one React batch.
        observeTarget();
        notify();
      });
    },
    [session, model, readTarget],
  );
  const getModel = useCallback(() => model.state, [model]);
  const subscribeSelection = useCallback(
    (notify: () => void) => selection.subscribe(notify),
    [selection],
  );
  const getSelection = useCallback(() => selection.current, [selection]);
  const state = useSyncExternalStore(subscribeModel, getModel);
  const selected = useSyncExternalStore(subscribeSelection, getSelection);
  const committed = useRef<{
    session: typeof session;
    state: State;
    callback: typeof onCommandError;
  } | null>(null);
  type Operation = {
    session: typeof session;
    epoch: number;
    target: Target;
    action: Action;
    callback: typeof onCommandError;
  };
  const [feedback, setFeedback] = useState<{
    operation: Operation;
    renderError?: AggregateError;
  } | null>(null);

  useLayoutEffect(() => {
    committed.current = { session, state, callback: onCommandError };
  });
  useLayoutEffect(() => {
    if (feedback && !valid(feedback.operation)) setFeedback(null);
  });
  useLayoutEffect(
    () => () => {
      session.operation = null;
      if (committed.current?.session === session) committed.current = null;
    },
    [session],
  );

  function valid(operation: Operation): boolean {
    const owner = operation.session;
    return (
      committed.current?.session === owner &&
      owner.operation === operation &&
      owner.epoch === operation.epoch &&
      readTarget(owner.model.state) === operation.target &&
      !owner.model.disposed &&
      !owner.selection.disposed
    );
  }

  function fail(operation: Operation, error: unknown): void {
    queueMicrotask(() => {
      if (!valid(operation)) return;
      if (!operation.callback) {
        setFeedback({ operation });
        return;
      }
      try {
        operation.callback(
          commandFailure(operation.action, operation.target, error),
        );
      } catch (callbackError) {
        // Revocation inside the callback also revokes local boundary feedback.
        if (valid(operation))
          setFeedback({
            operation,
            renderError: new AggregateError([error, callbackError]),
          });
      }
    });
  }

  function invoke(action: Action): void {
    const current = committed.current;
    const target = readTarget(state);
    if (
      current?.session !== session ||
      current.state !== state ||
      model.state !== state ||
      model.disposed ||
      selection.disposed ||
      target === null
    )
      return;
    if (!permits(state, action)) return;
    const operation: Operation = {
      session,
      epoch: session.epoch,
      target,
      action,
      callback: current.callback,
    };
    session.operation = operation;
    setFeedback(null);
    try {
      const original = execute(action);
      if (original !== undefined) {
        // Attach to the original promise even if notification unmounted us.
        void original.then(
          () => {},
          (error: unknown) => fail(operation, error),
        );
      }
    } catch (error) {
      fail(operation, error);
    }
  }

  const visible =
    feedback?.operation.session === session && valid(feedback.operation)
      ? feedback
      : null;
  if (visible?.renderError) throw visible.renderError;
  return { session, state, selected, invoke, failed: visible !== null };
}

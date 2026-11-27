import {
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type FocusEvent,
  type ReactElement,
} from "react";

/** Shared native input provenance and local focus, independent of query data. */
export function useInspectorButtons<
  Session,
  State,
  Action extends { readonly command: string },
>(
  session: Session,
  state: State,
  invoke: (action: Action) => void,
  sameAction: (left: Action, right: Action) => boolean,
) {
  const region = useRef<HTMLElement>(null);
  const focused = useRef<HTMLButtonElement | null>(null);
  const pointer = useRef<{
    id: number;
    binding: {
      session: Session;
      state: State;
      action: Action;
      primary: boolean;
    } | null;
    handled: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const binding = pointer.current?.binding;
    if (binding && (binding.session !== session || binding.state !== state))
      pointer.current!.binding = null;
    // Keep only the pointer id to suppress its eventual click; release old
    // borrowed models and replies as soon as the committed binding changes.
    const element = focused.current;
    if (element && !element.isConnected) {
      const root = region.current;
      if (root && root.ownerDocument.activeElement === root.ownerDocument.body)
        root.focus({ preventScroll: true });
      focused.current = null;
    }
  });
  useLayoutEffect(
    () => () => {
      pointer.current = null;
      focused.current = null;
    },
    [],
  );

  function activate(
    event: MouseEvent<HTMLButtonElement>,
    action: Action,
    context = false,
  ): void {
    if (event.button !== 0 || (context && !event.ctrlKey)) return;
    if (context) event.preventDefault();
    const captured = pointer.current;
    const paired =
      captured !== null &&
      (context ||
        ("pointerId" in event.nativeEvent
          ? event.nativeEvent.pointerId === captured.id
          : event.detail > 0));
    if (paired) {
      if (!context) pointer.current = null;
      const binding = captured.binding;
      if (
        captured.handled ||
        !binding?.primary ||
        binding.session !== session ||
        binding.state !== state ||
        !sameAction(binding.action, action)
      )
        return;
      captured.handled = true;
      invoke(binding.action);
    } else invoke(action);
  }

  function button(label: string, action: Action): ReactElement {
    return (
      <button
        key={action.command}
        type="button"
        onFocus={(event) => {
          focused.current = event.currentTarget;
        }}
        onPointerDown={(event) => {
          pointer.current = {
            id: event.pointerId,
            binding: {
              session,
              state,
              action,
              primary: event.button === 0 && event.isPrimary,
            },
            handled: false,
          };
        }}
        onPointerCancel={(event) => {
          if (pointer.current?.id === event.pointerId) pointer.current = null;
        }}
        onClick={(event) => activate(event, action)}
        onContextMenu={(event) => activate(event, action, true)}
      >
        {label}
      </button>
    );
  }
  function onBlurCapture(event: FocusEvent<HTMLElement>): void {
    if (
      event.relatedTarget &&
      !event.currentTarget.contains(event.relatedTarget)
    )
      focused.current = null;
  }
  return { region, button, onBlurCapture };
}

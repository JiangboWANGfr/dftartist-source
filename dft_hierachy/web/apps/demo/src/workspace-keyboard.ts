import type { KeyboardEvent } from "react";

/** A workspace key belongs to its focused control, within the current handler's region. */
export function ownsWorkspaceKeyboard(event: KeyboardEvent<HTMLElement>): boolean {
  const active = event.currentTarget.ownerDocument.activeElement;
  return !event.defaultPrevented &&
    !event.nativeEvent.isComposing &&
    event.target === active &&
    event.currentTarget.contains(active);
}

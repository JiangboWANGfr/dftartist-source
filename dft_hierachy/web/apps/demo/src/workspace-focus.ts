import { useCallback, useLayoutEffect, useRef } from "react";

function visible(element: Element): boolean {
  return element.isConnected &&
    element.getClientRects().length > 0 &&
    !element.closest("[hidden],[inert]") &&
    getComputedStyle(element).visibility !== "hidden";
}

/** Return only focus owned by a region being hidden/removed or a natively disabled control. */
export function useWorkspaceFocusReturn() {
  const pending = useRef<{ element: Element; target: HTMLElement } | null>(null);
  useLayoutEffect(() => {
    const supersede = (event: FocusEvent) => {
      // A newer focus choice revokes the old permission, even if it later blurs.
      if (event.target !== pending.current?.element) pending.current = null;
    };
    document.addEventListener("focusin", supersede);
    return () => {
      document.removeEventListener("focusin", supersede);
      pending.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const handoff = pending.current;
    if (!handoff || (visible(handoff.element) && !handoff.element.matches(":disabled"))) return;
    pending.current = null;
    const active = document.activeElement;
    if (
      (active === handoff.element || active === document.body) &&
      visible(handoff.target) &&
      !handoff.target.matches(":disabled,[aria-disabled='true']")
    )
      handoff.target.focus({ preventScroll: true });
  });
  return useCallback((owners: readonly (Element | null)[], target: HTMLElement | null, change: () => void) => {
    const element = document.activeElement;
    // Independent presentation changes do not revoke another region's return.
    // A real focusin above or a new owned transition supplies that authority.
    if (element && target && owners.some((owner) => owner?.contains(element)))
      pending.current = { element, target };
    try {
      change();
    } catch (error) {
      pending.current = null;
      throw error;
    }
  }, []);
}

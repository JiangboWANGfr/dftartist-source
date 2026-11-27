import { useMemo } from "react";
import type { Selection } from "@hier/viewmodel";
import type { DefRef, ObjectRef } from "@hier/protocol-types";

interface SelectionMembership {
  readonly objects: ReadonlySet<ObjectRef>;
  readonly definitions: ReadonlySet<DefRef>;
}

/** Passive ref markers only; bit/side-exact selection uses its own equality. */
export function selectionMembership(selection: Selection): SelectionMembership {
  const objects = new Set<ObjectRef>();
  const definitions = new Set<DefRef>();
  for (const item of selection.items) {
    const ref = item.ref;
    if (ref !== undefined) objects.add(ref);
    else {
      const def = item.def;
      if (def !== undefined) definitions.add(def);
    }
  }
  return { objects, definitions };
}

/** A mount owns only the current immutable snapshot's derived display sets. */
export function useSelectionMembership(selection: Selection): SelectionMembership {
  return useMemo(() => selectionMembership(selection), [selection]);
}

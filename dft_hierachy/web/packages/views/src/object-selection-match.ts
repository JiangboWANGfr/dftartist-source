import { useMemo } from "react";
import type { ObjectSelection, Selection } from "@hier/viewmodel";

/** Exact display highlight equality; a whole ref does not contain bit selections. */
export function sameObjectSelection(left: ObjectSelection, right: ObjectSelection): boolean {
  return (
    left.ref === right.ref &&
    left.side === right.side &&
    (left.bits === undefined
      ? right.bits === undefined
      : right.bits !== undefined &&
        left.bits.lsb === right.bits.lsb &&
        left.bits.width === right.bits.width)
  );
}


// Only model-owned primitive fields participate. Tuple encoding keeps opaque
// refs unambiguous; null slots represent absence because coordinates are UInts.
function objectSelectionKey(item: ObjectSelection): string {
  const bits = item.bits;
  return JSON.stringify([item.ref, item.side, bits?.lsb, bits?.width]);
}
const noMatch = (_item: ObjectSelection): boolean => false;

/** Exact display membership, derived only from one immutable selection. */
export function objectSelectionMatcher(
  selection: Selection,
): (item: ObjectSelection) => boolean {
  const items = selection.items;
  if (items.length < 2) {
    const only = items[0];
    return only?.ref === undefined
      ? noMatch
      : (item) => sameObjectSelection(only, item);
  }
  let keys: ReadonlySet<string> | undefined;
  return (item) => {
    if (keys === undefined) {
      const captured = new Set<string>();
      for (const value of items)
        if (value.ref !== undefined) captured.add(objectSelectionKey(value));
      keys = captured;
    }
    return keys.size > 0 && keys.has(objectSelectionKey(item));
  };
}

/** No global/history cache: the mount retains its current derived matcher. */
export function useObjectSelectionMatch(
  selection: Selection,
): (item: ObjectSelection) => boolean {
  return useMemo(() => objectSelectionMatcher(selection), [selection]);
}

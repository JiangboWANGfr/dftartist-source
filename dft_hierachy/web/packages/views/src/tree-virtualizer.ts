import { useLayoutEffect, useReducer, useState } from "react";
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";

type TreeWindowOptions = Pick<
  VirtualizerOptions<HTMLDivElement, HTMLDivElement>,
  | "count"
  | "getScrollElement"
  | "estimateSize"
  | "overscan"
  | "getItemKey"
  | "initialRect"
  | "rangeExtractor"
>;

/** React lifecycle binding for TanStack's window engine. Unlike its React
 * package, this boundary does not import a renderer or call flushSync. */
export function useTreeVirtualizer(options: TreeWindowOptions) {
  const [, render] = useReducer((version: number) => version + 1, 0);
  const resolved = {
    ...options,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    onChange: () => render(),
  };
  const [instance] = useState(
    () => new Virtualizer<HTMLDivElement, HTMLDivElement>(resolved),
  );
  instance.setOptions(resolved);
  // These are the lifecycle entry points used by TanStack's framework adapters.
  useLayoutEffect(() => instance._didMount(), [instance]);
  useLayoutEffect(() => instance._willUpdate());
  return instance;
}

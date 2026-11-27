import { useRef, useSyncExternalStore } from "react";
import {
  AnnotationLayer,
  resolveObjectAnnotations,
  type AnnotationLayerState,
} from "@hier/viewmodel";
import type { SnapshotId } from "@hier/protocol-types";

const readState = Object.getOwnPropertyDescriptor(AnnotationLayer.prototype, "state")!.get!;
const emptyLayers: readonly AnnotationLayer[] = Object.freeze([]);

/** Capture the view's borrowed list once; domain validation stays in L6. */
function captureLayers(snapshotId: SnapshotId, input: readonly AnnotationLayer[] | undefined) {
  try {
    if (input === undefined) return emptyLayers;
    if (!Array.isArray(input)) throw new TypeError("Annotations must be an array");
    const keys = Reflect.ownKeys(input),
      length = input.length;
    if (
      !Number.isInteger(length) ||
      length < 0 ||
      length > 0xffffffff ||
      keys.length !== length + 1 ||
      !keys.includes("length") ||
      keys.filter((key) => key !== "length").some((key, i) => key !== String(i))
    )
      throw new TypeError("Annotations must have contiguous own slots");
    const owned: AnnotationLayer[] = [];
    for (let i = 0; i < length; i++) owned.push(input[i]!);
    resolveObjectAnnotations(snapshotId, [], owned);
    return Object.freeze(owned);
  } catch (cause) {
    throw new TypeError("Views require genuine annotation layers for the same snapshot", { cause });
  }
}

function releaseAll(releases: (() => void)[]): void {
  const errors: unknown[] = [];
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Annotation subscriptions failed to close");
}

function createStore(layers: readonly AnnotationLayer[]) {
  let current: readonly AnnotationLayerState[] = Object.freeze(
    layers.map((layer) => readState.call(layer)),
  );
  return {
    snapshot: () => {
      const next: AnnotationLayerState[] = layers.map((layer) => readState.call(layer));
      if (next.some((state, i) => state !== current[i])) current = Object.freeze(next);
      return current;
    },
    subscribe: (notify: () => void) => {
      const releases: (() => void)[] = [];
      try {
        for (const layer of layers) {
          if ((readState.call(layer) as AnnotationLayerState).status === "active")
            releases.push(layer.subscribe(notify));
        }
      } catch (error) {
        try {
          releaseAll(releases);
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], "Annotation subscription failed");
        }
        throw error;
      }
      return () => releaseAll(releases);
    },
  };
}

export function useAnnotations(
  snapshotId: SnapshotId,
  input: readonly AnnotationLayer[] | undefined,
  owner: object,
): readonly AnnotationLayer[] {
  const layers = captureLayers(snapshotId, input);
  // This cache owns no resources; React installs/removes the committed subscription.
  const previous = useRef<{
    layers: readonly AnnotationLayer[];
    owner: object;
    store: ReturnType<typeof createStore>;
  } | null>(null);
  if (
    !previous.current ||
    previous.current.owner !== owner ||
    previous.current.layers.length !== layers.length ||
    layers.some((layer, i) => layer !== previous.current!.layers[i])
  )
    previous.current = { layers, owner, store: createStore(layers) };
  const captured = previous.current;
  useSyncExternalStore(captured.store.subscribe, captured.store.snapshot);
  return captured.layers;
}

import type { ObjectRef } from "@hier/protocol-types";
import type { AnnotationLayerState, ResolvedObjectAnnotation } from "@hier/viewmodel";

const empty: readonly ResolvedObjectAnnotation[] = Object.freeze([]);

/** Index only L6's resolved records for this presentation; never read layer marks. */
export function indexAnnotations(
  matches: readonly ResolvedObjectAnnotation[],
): (refs: readonly ObjectRef[]) => readonly ResolvedObjectAnnotation[] {
  const byRef = new Map<ObjectRef, ResolvedObjectAnnotation[]>();
  const layerOrder = new Map<AnnotationLayerState, number>();
  for (const match of matches) {
    if (!layerOrder.has(match.layer)) layerOrder.set(match.layer, layerOrder.size);
    let bucket = byRef.get(match.entry.ref);
    if (!bucket) {
      bucket = [];
      byRef.set(match.entry.ref, bucket);
    }
    bucket.push(match);
  }
  for (const bucket of byRef.values()) Object.freeze(bucket);
  return (refs) => {
    if (refs.length === 0) return empty;
    if (refs.length === 1) return byRef.get(refs[0]!) ?? empty;
    const unique = new Set(refs);
    if (unique.size === 1) return byRef.get(refs[0]!) ?? empty;
    const result: ResolvedObjectAnnotation[] = [];
    for (const ref of unique) {
      const bucket = byRef.get(ref);
      if (bucket) for (const match of bucket) result.push(match);
    }
    // Stable sorting keeps this descriptor's first-ref order within each layer.
    result.sort((a, b) => layerOrder.get(a.layer)! - layerOrder.get(b.layer)!);
    return result.length ? Object.freeze(result) : empty;
  };
}

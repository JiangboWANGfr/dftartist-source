/** Production-backed compile entry. The original proposal is fixed at 0a4f0ef.
 * Reuse the actual nominal layer after publication instead of defining a second brand. */
export { AnnotationLayer, AnnotationError, resolveObjectAnnotations } from "@hier/viewmodel";
export type {
  AnnotationMark,
  ObjectAnnotation,
  AnnotationLayerOptions,
  AnnotationLayerState,
  AnnotationErrorCode,
  ResolvedObjectAnnotation,
} from "@hier/viewmodel";
export { HierarchyTree, SchematicView } from "@hier/views";
export type { HierarchyTreeProps, SchematicViewProps } from "@hier/views";

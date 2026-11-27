/** Display geometry for the fixed folded LayoutService mode (DESIGN 6.33). */
import type { DisplayNodeId, DisplayEdgeId, FoldProjectionId } from "./fold-projection-types.js";
import type {
  LayoutIdentity,
  LayoutNodeGeometry,
  LayoutEdgeGeometry,
  LayoutResult,
  LayoutStateOf,
} from "./layout-types.js";

export type LayoutMode = "graph" | "folded";
export interface FoldedLayoutIdentity extends LayoutIdentity {
  readonly projectionId: FoldProjectionId;
}
export interface FoldedLayoutNodeGeometry extends Omit<LayoutNodeGeometry, "id"> {
  readonly id: DisplayNodeId;
}
export interface FoldedLayoutEdgeGeometry extends Omit<LayoutEdgeGeometry, "id" | "from" | "to"> {
  readonly id: DisplayEdgeId;
  /** Display endpoints from the captured projection; never original Graph member IDs. */
  readonly from: DisplayNodeId;
  readonly to: DisplayNodeId;
}
export interface FoldedLayoutResult
  extends FoldedLayoutIdentity, Omit<LayoutResult, "nodes" | "edges"> {
  readonly nodes: readonly FoldedLayoutNodeGeometry[];
  readonly edges: readonly FoldedLayoutEdgeGeometry[];
}
export type FoldedLayoutState = LayoutStateOf<FoldedLayoutIdentity, FoldedLayoutResult>;

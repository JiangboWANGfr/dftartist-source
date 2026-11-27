import { CLIENT_PROTOCOL_VERSION } from "@hier/client";

/** L6. Tree model, selection, graph session; no React. */
export const VIEWMODEL_PROTOCOL_VERSION = CLIENT_PROTOCOL_VERSION;

export { DefinitionInstancesModel } from "./definition-instances-model.js";
export { DefinitionInstancesError } from "./definition-instances-types.js";
export type {
  DefinitionInstancesQuery,
  DefinitionInstancesOptions,
  DefinitionInstancesPage,
  DefinitionInstancesErrorCode,
  DefinitionInstancesFailure,
  DefinitionInstancesState,
} from "./definition-instances-types.js";

export { SearchModel } from "./search-model.js";
export { SearchError } from "./search-types.js";
export type {
  SearchQuery,
  SearchOptions,
  SearchPage,
  SearchErrorCode,
  SearchFailure,
  SearchState,
} from "./search-types.js";

export { SelectionModel } from "./selection-model.js";
export { SelectionError } from "./selection-types.js";
export type {
  DefinitionSelection,
  ObjectSelection,
  Selection,
  SelectionBits,
  SelectionErrorCode,
  SelectionItem,
  SelectionOptions,
  SelectionOrigin,
} from "./selection-types.js";

export { TreeModel } from "./tree-model.js";
export { TreeError } from "./tree-types.js";
export type {
  RowId,
  TreeCompleteness,
  TreeDiagnosticIssue,
  TreeErrorCode,
  TreeFailure,
  TreeInstance,
  TreeOptions,
  TreePageState,
  TreeRevealState,
  TreeRow,
  InstanceTreeRow,
  ScopeTreeRow,
  StatusTreeRow,
} from "./tree-types.js";

export { InstancePropertiesModel } from "./instance-properties-model.js";
export { InstancePropertiesError } from "./instance-properties-types.js";
export type {
  InstanceProperties,
  InstancePropertiesErrorCode,
  InstancePropertiesFailure,
  InstancePropertiesState,
} from "./instance-properties-types.js";

export { ObjectConnectionsModel } from "./object-connections-model.js";
export { ObjectConnectionsError } from "./object-connections-types.js";
export type {
  ObjectConnections,
  ObjectConnectionsErrorCode,
  ObjectConnectionsFailure,
  ObjectConnectionsState,
  ObjectConnectionsTarget,
} from "./object-connections-types.js";

export { SourceDocumentModel } from "./source-document-model.js";
export { SourceDocumentError } from "./source-document-types.js";
export { SourcePositionError } from "./source-position-error.js";
export type { SourcePositionErrorCode } from "./source-position-error.js";
export type {
  SourceDocument,
  SourceDocumentErrorCode,
  SourceDocumentFailure,
  SourceDocumentLocation,
  SourceDocumentState,
  SourceDocumentTarget,
  SourceTextPosition,
  SourceTextRange,
} from "./source-document-types.js";

export { SourceCandidatesModel } from "./source-candidates-model.js";
export { SourceCandidatesError } from "./source-candidates-types.js";
export type {
  SourceCandidatesQuery,
  SourceCandidatesOptions,
  SourceCandidatesPage,
  SourceCandidatesErrorCode,
  SourceCandidatesFailure,
  SourceCandidatesState,
} from "./source-candidates-types.js";

export { SourceNavigationModel } from "./source-navigation-model.js";
export { SourceNavigationError } from "./source-navigation-types.js";
export { SourceConfirmationError } from "./source-confirmation-types.js";
export type {
  SourceCandidateAction,
  SourceConfirmationErrorCode,
} from "./source-confirmation-types.js";
export type {
  SourceNavigationCandidates,
  SourceNavigationErrorCode,
  SourceNavigationRefresh,
  SourceNavigationState,
} from "./source-navigation-types.js";

export { PathResolutionModel } from "./path-resolution-model.js";
export { PathResolutionError } from "./path-resolution-types.js";
export type {
  PathResolutionQuery,
  PathResolutionReply,
  PathResolutionErrorCode,
  PathResolutionFailure,
  PathResolutionState,
} from "./path-resolution-types.js";

export { GraphSession } from "./graph-session.js";
export { GraphSessionError } from "./graph-types.js";
export type {
  GraphSessionId,
  GraphSourceId,
  GraphNodeId,
  GraphEdgeId,
  GraphOrigin,
  GraphPort,
  GraphNodeInput,
  GraphNodeKey,
  GraphEndpoint,
  GraphEdgeInput,
  GraphFragment,
  GraphNodeMember,
  GraphEdgeMember,
  GraphSourceContent,
  GraphSessionErrorCode,
  GraphSourceFailure,
  GraphSourceState,
  GraphSessionState,
  GraphSourceOptions,
  GraphLoadContext,
  GraphLoader,
  GraphSource,
} from "./graph-types.js";

export { LayoutService } from "./layout-service.js";
export { LayoutError } from "./layout-types.js";
export type {
  LayoutTaskId,
  LayoutDirection,
  LayoutPortSide,
  LayoutPortInput,
  LayoutNodeInput,
  LayoutEdgeInput,
  LayoutProjection,
  LayoutIdentity,
  LayoutPoint,
  LayoutPortGeometry,
  LayoutNodeGeometry,
  LayoutEdgeGeometry,
  LayoutResult,
  LayoutErrorCode,
  LayoutFailure,
  LayoutState,
  LayoutServiceOptions,
} from "./layout-types.js";

export { AnnotationLayer, resolveObjectAnnotations } from "./annotation-layer.js";
export { AnnotationError } from "./annotation-types.js";
export type {
  AnnotationMark,
  ObjectAnnotation,
  AnnotationLayerOptions,
  AnnotationLayerState,
  AnnotationErrorCode,
  ResolvedObjectAnnotation,
} from "./annotation-types.js";

export { createGraphProjection, selectGraphElement } from "./graph-projection.js";
export { GraphProjectionError } from "./graph-projection-types.js";
export type {
  GraphNodeTarget,
  GraphEdgeTarget,
  GraphElementTarget,
  ProjectedGraphNode,
  ProjectedGraphEdge,
  GraphProjection,
  GraphProjectionErrorCode,
} from "./graph-projection-types.js";

export {
  FoldedGraphProjection,
  createFoldedGraphProjection,
  selectFoldedGraphElement,
} from "./fold-projection.js";
export { FoldProjectionError } from "./fold-projection-types.js";
export type {
  FoldProjectionId,
  DisplayNodeId,
  DisplayEdgeId,
  HierarchyFoldGroup,
  BusFoldGroup,
  GraphFoldGroup,
  GraphFoldOptions,
  FoldedGraphNodeTarget,
  FoldedGraphEdgeTarget,
  FoldedGraphTarget,
  FoldedGraphNode,
  FoldedGraphEdge,
  FoldProjectionErrorCode,
} from "./fold-projection-types.js";

export type {
  LayoutMode,
  FoldedLayoutIdentity,
  FoldedLayoutNodeGeometry,
  FoldedLayoutEdgeGeometry,
  FoldedLayoutResult,
  FoldedLayoutState,
} from "./folded-layout-types.js";

import { VIEWMODEL_PROTOCOL_VERSION } from "@hier/viewmodel";

/** L7. React components; talks to the kernel only through the view model. */
export const VIEWS_PROTOCOL_VERSION = VIEWMODEL_PROTOCOL_VERSION;

export {
  SourceView,
  type SourceViewProps,
  type SourceViewPositionQuery,
  type SourceViewPositionFailure,
} from "./source-view.js";

export { SourceCandidatesView } from "./source-candidates-view.js";
export type {
  SourceCandidatesViewProps,
  SourceCandidatesViewCommand,
  SourceCandidatesViewFailure,
} from "./source-candidates-types.js";
export { HierarchyTree } from "./hierarchy-tree.js";
export type {
  HierarchyTreeProps,
  TreeViewCommand,
  TreeViewCommandFailure,
} from "./hierarchy-tree-types.js";

export { PropertiesPanel } from "./properties-panel.js";
export type {
  PropertiesPanelProps,
  PropertiesPanelCommand,
  PropertiesPanelCommandFailure,
} from "./properties-panel-types.js";

export { ObjectConnectionsView } from "./object-connections-view.js";
export type {
  ObjectConnectionsViewProps,
  ObjectConnectionsViewCommand,
  ObjectConnectionsViewFailure,
} from "./object-connections-view-types.js";

export { SearchResultsView } from "./search-results-view.js";
export type {
  SearchResultsViewProps,
  SearchResultsViewCommand,
  SearchResultsViewFailure,
} from "./search-results-view-types.js";

export { DefinitionInstancesView } from "./definition-instances-view.js";
export type {
  DefinitionInstancesViewProps,
  DefinitionInstancesViewCommand,
  DefinitionInstancesViewFailure,
} from "./definition-instances-view-types.js";

export { PathResolutionView } from "./path-resolution-view.js";
export type {
  PathResolutionViewProps,
  PathResolutionViewCommand,
  PathResolutionViewFailure,
} from "./path-resolution-view-types.js";

export { SchematicView } from "./schematic-view.js";
export type {
  SchematicViewProps,
  FoldedSchematicViewProps,
  FoldedSchematicViewFailure,
  SchematicViewCommand,
  SchematicViewFailure,
} from "./schematic-view-types.js";

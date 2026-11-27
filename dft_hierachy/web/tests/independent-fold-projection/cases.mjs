// Independent input/expected/basis registry; only DESIGN and original B fixtures.
export const cases = [
  [
    "F01",
    "Empty graph + empty options => frozen empty projection, same state, no publication",
    "6.32.1/2/4",
  ],
  [
    "F02",
    "All groups expanded => original ordered members/labels/items/connection recovery",
    "6.32.2/3;6.30",
  ],
  [
    "F03",
    "Null records + getter/Proxy arrays => once capture, no iterator/toJSON, immutable copy",
    "6.32.4",
  ],
  [
    "F04",
    "Missing/extra/symbol/undefined/nonplain/sparse options => invalid_argument, no mutation",
    "6.32.4",
  ],
  ["F05", "Bad groups, IDs, overlap, duplicate/unknown collapsed => reject atomically", "6.32.1/4"],
  ["F06", "Fake/proxy graph and disposed real graph => reject before reading options", "6.32.4"],
  [
    "F07",
    "Throwing later getter => invalid_argument with exact cause; old state/projection retained",
    "6.32.4",
  ],
  ["F08", "Getter disposes graph (normal/throw) => disposed takes precedence", "6.32.4"],
  [
    "F09",
    "Getter changes graph (normal/throw) => stale_graph, getter changes not rolled back",
    "6.32.4",
  ],
  [
    "F10",
    "Nested collapsed sets => outermost only; opening outer restores inner intent",
    "6.32.1/2",
  ],
  [
    "F11",
    "Hierarchy => all internal edges incl self-loop retained; external boundaries rerouted",
    "6.32.2",
  ],
  [
    "F12",
    "Collapsed bus => directed displayed endpoints partition; singleton/reverse stay separate",
    "6.32.3",
  ],
  ["F13", "Distinct/ungrouped buses => never merge despite equal labels/endpoints", "6.32.1/3"],
  [
    "F14",
    "Input group/member/collapsed order and labels => output state order, stable display identity",
    "6.32.1/3",
  ],
  [
    "F15",
    "Two same-state projections and group member changes => fresh generation, stable IDs; other session differs",
    "6.32.1/4",
  ],
  [
    "F16",
    "Full expand => each original node/edge once, original facts/bits/from/to/owners retained",
    "6.32.2/3",
  ],
  [
    "F17",
    "Source withdrawal => historical projection readable, old selection stale, old group rejected",
    "6.32.3/4",
  ],
  [
    "F18",
    "Aggregated node selection => original member items only, one select, exact undo/redo, no graph work",
    "6.32.4",
  ],
  [
    "F19",
    "Bundled/rerouted edge selection => original endpoint slices/side, not aggregate node items",
    "6.32.4;6.30",
  ],
  [
    "F20",
    "Annotation resolver => exact original refs/multiple layers, no synthetic group fact",
    "6.32.4;6.31",
  ],
  [
    "F21",
    "Target fields/unknown IDs/generation => strict errors, no history; each target read once/cause",
    "6.32.4",
  ],
  [
    "F22",
    "Fake/proxy graph/selection/projection and unbound/foreign snapshot => reject before target",
    "6.32.4",
  ],
  [
    "F23",
    "Selection target getter changes/disposes graph or disposes selection => precedence, no select",
    "6.32.4",
  ],
  [
    "F24",
    "No selectable items => not_selectable; raw SelectionError/AggregateError propagate without rollback",
    "6.32.4",
  ],
].map(([id, inputExpected, basis]) => ({ id, inputExpected, basis: "DESIGN §" + basis }));

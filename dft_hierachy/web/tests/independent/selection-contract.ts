// Agent B consumer: the same oracle compiles against the proposed .d.ts now,
// and @hier/viewmodel production declarations after implementation.
// No import or reuse of Agent A's consumer.
import {
  SelectionModel,
  SelectionError,
  type Selection,
  type SelectionItem,
  type SelectionOptions,
  type SelectionOrigin,
  type SelectionBits,
  type SelectionErrorCode,
} from "@hier/viewmodel";
import type {
  Slice,
  ObjectRef,
  DefRef,
  SnapshotId,
  Side,
} from "@hier/protocol-types";
import type { Unsubscribe } from "@hier/client";

declare const ref: ObjectRef;
declare const def: DefRef;
declare const snapshotId: SnapshotId;
declare const side: Side;
declare const slice: Slice;

const old: Selection = { items: [slice], origin: "tree" };
const object: SelectionItem = { ref };
const objectBits: SelectionItem = { ref, bits: { lsb: 0, width: 0 } };
const objectSide: SelectionItem = { ref, side };
const definition: SelectionItem = { def };
const multi: Selection = {
  items: [object, objectBits, objectSide, definition],
  origin: "source",
  snapshotId,
};
const origins: readonly SelectionOrigin[] = [
  "tree",
  "graph",
  "source",
  "props",
  "external",
];
const bits: SelectionBits = { lsb: 0, width: 1 };
const options: SelectionOptions = { snapshotId, historyLimit: 128 };
const m = new SelectionModel(options);
const unbound = new SelectionModel();
const boundSnapshot: SnapshotId | undefined = m.snapshotId;
const current: Selection = m.current;
const navigation: readonly boolean[] = [
  m.canGoBack,
  m.canGoForward,
  m.disposed,
];
m.select(multi);
unbound.select(old);
m.back();
m.forward();
const unsubscribe: Unsubscribe = m.subscribe((s) => {
  const items: readonly SelectionItem[] = s.items;
  for (const item of items) {
    if (item.def !== undefined) {
      const identity: DefRef = item.def;
      void identity;
    } else {
      const identity: ObjectRef = item.ref;
      const direction: Side | undefined = item.side;
      const range: SelectionBits | undefined = item.bits;
      void [identity, direction, range];
    }
  }
});
unsubscribe();
m.dispose();
unbound.dispose();

const codes: readonly SelectionErrorCode[] = [
  "invalid_options",
  "invalid_selection",
  "snapshot_mismatch",
  "disposed",
  "reentrant_change",
];
for (const code of codes) {
  const error: Error = new SelectionError(code, "B diagnostic");
  const local = error as SelectionError;
  const value: SelectionErrorCode = local.code;
  void value;
}
function allCodes(code: SelectionErrorCode): string {
  switch (code) {
    case "invalid_options":
      return "options";
    case "invalid_selection":
      return "input";
    case "snapshot_mismatch":
      return "snapshot";
    case "disposed":
      return "closed";
    case "reentrant_change":
      return "reentrant";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}
void [boundSnapshot, current, navigation, origins, allCodes];

// @ts-expect-error B-T01: ref/def are mutually exclusive.
const twoAddresses: SelectionItem = { ref, def };
// @ts-expect-error B-T02: definition selections cannot carry bits.
const definitionBits: SelectionItem = { def, bits };
// @ts-expect-error B-T03: definition selections cannot carry side.
const definitionSide: SelectionItem = { def, side };
// @ts-expect-error B-T04: an address is mandatory.
const noAddress: SelectionItem = {};
// @ts-expect-error B-T05: side is the protocol Side enum.
const invalidSide: SelectionItem = { ref, side: "outer" };
// @ts-expect-error B-T06: no new origin is implied by host panels.
const invalidOrigin: Selection = { items: [], origin: "panel" };
// @ts-expect-error B-T07: missing items is not an empty selection.
const missingItems: Selection = { origin: "tree" };
// @ts-expect-error B-T08: optional bits must be omitted rather than undefined.
const undefinedBits: SelectionItem = { ref, bits: undefined };
// @ts-expect-error B-T09: optional side must be omitted rather than undefined.
const undefinedSide: SelectionItem = { ref, side: undefined };
// @ts-expect-error B-T10: optional snapshot must be omitted rather than undefined.
const undefinedSnapshot: Selection = {
  items: [],
  origin: "external",
  snapshotId: undefined,
};
// @ts-expect-error B-T11: explicit undefined does not turn a def into an object selection.
const undefinedDef: SelectionItem = { ref, def: undefined };
// @ts-expect-error B-T12: explicit undefined does not turn a ref into a definition selection.
const undefinedRef: SelectionItem = { def, ref: undefined };
// @ts-expect-error B-T13: width is mandatory when bits exist.
const partialBits: SelectionBits = { lsb: 0 };
// @ts-expect-error B-T14: primitives do not accept null.
const nullRef: SelectionItem = { ref: null };
// @ts-expect-error B-T15: constructor snapshot type stays the protocol string primitive.
const invalidSnapshotOption: SelectionOptions = { snapshotId: 1 };
// @ts-expect-error B-T16: numeric historyLimit is not nullable.
const nullHistory: SelectionOptions = { historyLimit: null };
// @ts-expect-error B-T17: undefined historyLimit must be omitted.
const undefinedHistory: SelectionOptions = { historyLimit: undefined };
// @ts-expect-error B-T18: undefined snapshotId option must be omitted.
const undefinedSnapshotOption: SelectionOptions = { snapshotId: undefined };
// @ts-expect-error B-T19: published items are readonly.
current.items.push(object);
// @ts-expect-error B-T20: the primary ordered item cannot be overwritten.
current.items[0] = definition;
// @ts-expect-error B-T21: published origin is readonly.
current.origin = "props";
// @ts-expect-error B-T22: published snapshot is readonly.
current.snapshotId = snapshotId;
// @ts-expect-error B-T23: published object address is readonly.
object.ref = ref;
// @ts-expect-error B-T24: published bit range is readonly.
bits.width = 2;
// @ts-expect-error B-T25: bound snapshot is immutable.
m.snapshotId = snapshotId;
// @ts-expect-error B-T26: current is a readonly getter.
m.current = multi;
// @ts-expect-error B-T27: history status is readonly.
m.canGoBack = false;
// @ts-expect-error B-T28: forward status is readonly.
m.canGoForward = false;
// @ts-expect-error B-T29: disposed status is readonly.
m.disposed = false;
// @ts-expect-error B-T30: local errors are not Core/SDK error codes.
const unknownCode: SelectionErrorCode = "bad_request";
// @ts-expect-error B-T31: error code is readonly.
new SelectionError("disposed", "B").code = "invalid_selection";
// @ts-expect-error B-T32: subscriber must be a function.
m.subscribe({});
// @ts-expect-error B-T33: select requires an explicit Selection.
m.select();
void [
  twoAddresses,
  definitionBits,
  definitionSide,
  noAddress,
  invalidSide,
  invalidOrigin,
  missingItems,
  undefinedBits,
  undefinedSide,
  undefinedSnapshot,
  undefinedDef,
  undefinedRef,
  partialBits,
  nullRef,
  invalidSnapshotOption,
  nullHistory,
  undefinedHistory,
  undefinedSnapshotOption,
  unknownCode,
];

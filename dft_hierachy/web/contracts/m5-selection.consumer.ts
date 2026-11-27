// Compile-only API review cases, not B's behavioral oracle or a runtime test.
import type { HierClient, Unsubscribe } from "@hier/client";
import type { DefRef, ObjectRef, Side, Slice } from "@hier/protocol-types";
import {
  SelectionError,
  SelectionModel,
  type DefinitionSelection,
  type ObjectSelection,
  type Selection,
  type SelectionErrorCode,
  type SelectionItem,
} from "./m5-selection.js";

declare const slice: Slice;
declare const objectRef: ObjectRef;
declare const definitionRef: DefRef;
declare const side: Side;
declare const client: HierClient;

// The existing no-argument/Slice calls retain their structural shape.
const standalone = new SelectionModel();
standalone.select({ items: [slice], origin: "tree" });
standalone.back();
standalone.forward();
const unsubscribe: Unsubscribe = standalone.subscribe((value: Selection) => {
  const item: SelectionItem | undefined = value.items[0];
  if (item && item.def !== undefined) {
    const ref: DefRef = item.def;
    void ref;
  } else if (item) {
    const ref: ObjectRef = item.ref;
    void ref;
  }
});
unsubscribe();

// The real host constructs a fresh, bound model after ready; it owns the client.
async function hostSelection(): Promise<SelectionModel> {
  const { snapshotId } = await client.ready;
  const model = new SelectionModel({ snapshotId, historyLimit: 128 });
  const items = [
    { ref: objectRef },
    { ref: objectRef, bits: { lsb: 2, width: 3 }, side },
    { def: definitionRef },
  ] as const satisfies readonly SelectionItem[];
  model.select({ snapshotId, items, origin: "external" });
  const flags: readonly boolean[] = [
    model.canGoBack,
    model.canGoForward,
    model.disposed,
  ];
  void flags;
  return model;
}
void hostSelection;

const objectOnly: ObjectSelection = { ref: objectRef };
const definitionOnly: DefinitionSelection = { def: definitionRef };
void [objectOnly, definitionOnly];

// Declaration diagnostics below must remain errors; no runtime is executed.
// @ts-expect-error A definition and an occurrence are distinct alternatives.
const mixed: SelectionItem = { ref: objectRef, def: definitionRef };
// @ts-expect-error Definitions do not denote a bit slice.
const definitionBits: SelectionItem = {
  def: definitionRef,
  bits: { lsb: 0, width: 1 },
};
// @ts-expect-error Definitions do not have a port side.
const definitionSide: SelectionItem = { def: definitionRef, side: "inside" };
// @ts-expect-error Side uses the existing protocol enum.
const invalidSide: SelectionItem = { ref: objectRef, side: "input" };
// @ts-expect-error Optional fields are omitted, not explicitly undefined.
const undefinedBits: SelectionItem = { ref: objectRef, bits: undefined };
// @ts-expect-error Plan identities belong to the host document.
const plan: SelectionItem = { documentId: "plan", localId: "node" };
// @ts-expect-error Origin is a closed UI enum.
standalone.select({ items: [], origin: "ipc" });
// @ts-expect-error Selection outputs are immutable at every published level.
standalone.current.items.push(slice);
// @ts-expect-error Origin is immutable.
standalone.current.origin = "graph";
// @ts-expect-error The lifetime's snapshot cannot be rebound.
standalone.snapshotId = "another-snapshot";
const first = standalone.current.items[0];
if (first?.ref !== undefined) {
  // @ts-expect-error References are immutable.
  first.ref = objectRef;
  if (first.bits) {
    // @ts-expect-error Nested bit ranges are immutable.
    first.bits.width = 3;
  }
}

const diagnostic = new SelectionError(
  "snapshot_mismatch",
  "Selection belongs to another snapshot",
);
const diagnosticCode: SelectionErrorCode = diagnostic.code;
// @ts-expect-error L6 diagnostics do not invent or extend wire error codes.
const wireLikeError: SelectionErrorCode = "protocol_error";
void [
  mixed,
  definitionBits,
  definitionSide,
  invalidSide,
  undefinedBits,
  plan,
  diagnosticCode,
  wireLikeError,
];
standalone.dispose();

import type { SourceHit as LegacyHit, SnapshotId } from "@hier/protocol-types";
import type { Selection, SelectionItem } from "@hier/viewmodel";
import type { SourceHit, SourceRefKind } from "./proposal.js";

declare const legacy: LegacyHit;
declare const hit: SourceHit;
declare const snapshotId: SnapshotId;
// Existing data and consumers remain source compatible.
const oldResponse: SourceHit = legacy;
const newResponse: SourceHit = { ...legacy, refKind: "definition" };
const oldConsumer: LegacyHit = newResponse;
const objectResponse: SourceHit = { ...legacy, refKind: "object" };
const optional: SourceRefKind | undefined = hit.refKind;

// Shape-only example. Current-page/action/session guards belong to a later unit.
function addressOnly(value: SourceHit): SelectionItem | undefined {
  switch (value.refKind) {
    case "definition":
      return { def: value.ref };
    case "object":
      return { ref: value.ref };
    case undefined:
      return undefined;
    default: {
      const exhaustive: never = value.refKind;
      return exhaustive;
    }
  }
}
const address = addressOnly(hit);
const selection: Selection | undefined = address
  ? { items: [address], origin: "source", snapshotId }
  : undefined;

// @ts-expect-error R01 range kind is not an address kind
const rangeKind: SourceRefKind = "statement";
// @ts-expect-error R02 unknown address kind
const futureKind: SourceRefKind = "future";
// @ts-expect-error R03 null is not an omitted field
const nullKind: SourceHit = { ...legacy, refKind: null };
// @ts-expect-error R04 explicit undefined is not omission
const undefinedKind: SourceHit = { ...legacy, refKind: undefined };
// @ts-expect-error R05 numeric tag rejected
const numberKind: SourceHit = { ...legacy, refKind: 0 };
// @ts-expect-error R06 array tag rejected
const arrayKind: SourceHit = { ...legacy, refKind: ["object"] };
// @ts-expect-error R07 object tag rejected
const objectKind: SourceHit = { ...legacy, refKind: { type: "object" } };
// @ts-expect-error R08 boolean tag rejected
const boolKind: SourceHit = { ...legacy, refKind: false };
// @ts-expect-error R09 an old response does not promise the tag
const requiredKind: SourceRefKind = hit.refKind;
// @ts-expect-error R10 source range union remains unchanged
const alteredRange: SourceHit = { ...legacy, kind: "object" };
// @ts-expect-error R11 ref remains required
const missingRef: SourceHit = { kind: "definition", span: legacy.span };
// @ts-expect-error R12 span remains required
const missingSpan: SourceHit = { ref: legacy.ref, kind: "definition" };
// @ts-expect-error R13 source kind remains required
const missingKind: SourceHit = { ref: legacy.ref, span: legacy.span };
// @ts-expect-error R14 Selection addresses remain mutually exclusive
const bothAddresses: SelectionItem = { ref: hit.ref, def: hit.ref };
// @ts-expect-error R15 missing tag cannot create a definite address
const uncheckedAddress: SelectionItem = addressOnly(oldResponse);
const definitionWithBits = { def: hit.ref, bits: { lsb: 0, width: 1 } };
// @ts-expect-error R16 definition selections do not gain bit ranges
const definitionBits: SelectionItem = definitionWithBits;

void [oldConsumer, objectResponse, optional, selection];

import {
  type SourceRefKind,
  type SourceHit,
  type SourceHitPage,
  type SourceKind,
  type SourceSpan,
  type SourceResolveResult,
  type SourceResolveResponse,
  type WireDefinitions,
  type ResultOf,
  type ObjectRef,
  type DefRef,
  type SnapshotId,
  validateDefinition,
} from "@hier/protocol-types";
import type { Reply } from "@hier/client";
import type {
  SourceCandidatesPage,
  Selection,
  SelectionItem,
  SelectionModel,
} from "@hier/viewmodel";
type RK = SourceRefKind;
type Hit = SourceHit;
type Page = SourceResolveResult;
type HitPage = SourceHitPage;
type Response = SourceResolveResponse;
type MethodResult = ResultOf<"source.resolve">;
type WireHit = WireDefinitions["SourceHit"];
type WireRK = WireDefinitions["SourceRefKind"];
declare const span: SourceSpan;
declare const hit: Hit;
declare const response: Response;
declare const reply: Reply<Page>;
declare const candidatePage: SourceCandidatesPage;
declare const snapshotId: SnapshotId;
declare const model: SelectionModel;
declare const addressKind: RK;
interface LegacyHit {
  ref: ObjectRef | DefRef;
  kind: SourceKind;
  span: SourceSpan;
  inst?: ObjectRef;
  [extension: string]: unknown;
}
const old: LegacyHit = {
  ref: "opaque without a namespace",
  kind: "definition",
  span,
};
const compatibleOld: Hit = old;
const tagged: Hit = { ...old, refKind: "object" };
const legacyConsumer: LegacyHit = tagged;
const definitionTag: RK = "definition";
const objectTag: RK = "object";
const optionalTag: RK | undefined = hit.refKind;
const writable: Hit = { ...old };
writable.refKind = "definition";
const crossAxes: Hit[] = [
  {
    ...old,
    ref: "obj:looks-object",
    kind: "definition",
    refKind: "definition",
  },
  {
    ...old,
    ref: "def:looks-definition",
    kind: "definition",
    refKind: "object",
  },
  {
    ...old,
    kind: "instantiation",
    refKind: "definition",
    inst: "unrelated context",
  },
  { ...old, kind: "statement", refKind: "object" },
  { ...old, kind: "statement", refKind: "definition", inst: "context" },
  { ...old, kind: "instantiation" },
];
const extended: Hit = {
  ...old,
  refKind: "object",
  B_future: { refKind: null },
};
const page: Page = { items: [old, tagged], next: "opaque cursor" };
const aliasPage: HitPage = page;
const methodResult: MethodResult = page;
const wireHit: WireHit = tagged;
const wireTag: WireRK = "object";
const responseTag: RK | undefined = response.result.items[0]?.refKind;
const replyTag: RK | undefined = reply.result.items[0]?.refKind;
const candidateTag: RK | undefined = candidatePage.result.items[0]?.refKind;
declare const unknownValue: unknown;
if (validateDefinition("SourceRefKind", unknownValue)) {
  const narrowed: RK = unknownValue;
  void narrowed;
}
// Compile-only address witnesses. No confirmation algorithm or runtime call.
declare const definitionHit: Hit & { refKind: "definition" };
declare const objectHit: Hit & { refKind: "object" };
const definitionAddress: SelectionItem = { def: definitionHit.ref };
const objectAddress: SelectionItem = { ref: objectHit.ref };
const selection: Selection = {
  items: [definitionAddress, objectAddress],
  origin: "source",
  snapshotId,
};
const oldSelect: (value: Selection) => void = model.select.bind(model);
void [
  compatibleOld,
  legacyConsumer,
  definitionTag,
  objectTag,
  optionalTag,
  writable,
  crossAxes,
  extended,
  aliasPage,
  methodResult,
  wireHit,
  wireTag,
  responseTag,
  replyTag,
  candidateTag,
  selection,
  oldSelect,
];

// @ts-expect-error RK01: empty address kind is not omission
const empty: RK = "";
// @ts-expect-error RK02: object category names are not address kinds
const instance: RK = "instance";
// @ts-expect-error RK03: enum spelling is exact
const capital: RK = "Definition";
// @ts-expect-error RK04: no trimming/coercion in the public union
const whitespace: RK = "object ";
// @ts-expect-error RK05: address kind is not nullable
const nullKind: RK = null;
// @ts-expect-error RK06: enum itself excludes undefined
const undefinedKind: RK = undefined;
// @ts-expect-error RK07: numeric address kind is invalid
const numeric: RK = 1;
// @ts-expect-error RK08: boolean address kind is invalid
const boolean: RK = false;
// @ts-expect-error RK09: array address kind is invalid
const array: RK = ["object"];
// @ts-expect-error RK10: object wrapper is not the string enum
const object: RK = { value: "object" };
// @ts-expect-error RK11: explicit null field is not omission
const nullTag: Hit = { ...old, refKind: null };
// @ts-expect-error RK12: exact optional forbids an explicit undefined field
const undefinedTag: Hit = { ...old, refKind: undefined };
// @ts-expect-error RK13: declaration is a source concept, not an enum member
const inventedTag: Hit = { ...old, refKind: "declaration" };
// @ts-expect-error RK14: a numeric tag cannot hide as an unknown extension
const numberTag: Hit = { ...old, refKind: 7 };
// @ts-expect-error RK15: existing ref remains required
const noRef: Hit = { kind: "definition", span, refKind: "definition" };
// @ts-expect-error RK16: existing source kind remains required
const noKind: Hit = { ref: "opaque", span, refKind: "object" };
// @ts-expect-error RK17: existing span remains required
const noSpan: Hit = { ref: "opaque", kind: "statement", refKind: "object" };
// @ts-expect-error RK18: the address enum must not replace SourceKind
const addressAsKind: Hit = { ...old, kind: "object" };
// @ts-expect-error RK19: old optional inst is not nullable
const nullContext: Hit = { ...old, inst: null };
// @ts-expect-error RK20: opaque inst is still a string, not a number
const numberContext: Hit = { ...old, inst: 1 };
// @ts-expect-error RK21: old kind remains non-null
const nullScope: Hit = { ...old, kind: null };
// @ts-expect-error RK22: old span remains non-null
const nullSpan: Hit = { ...old, span: null };
// @ts-expect-error RK23: absence remains possible until explicitly narrowed
const assumedPresent: RK = hit.refKind;
// @ts-expect-error RK24: nested result items validate the declared field
const nullNested: Page = { items: [{ ...old, refKind: null }] };
// @ts-expect-error RK25: the public page alias carries the new member
const badPage: HitPage = { items: [{ ...old, refKind: "future" }] };
// @ts-expect-error RK26: method registry result carries the same member
const badMethod: MethodResult = { items: [{ ...old, refKind: false }] };
// @ts-expect-error RK27: new named definition is the same exact enum
const badWireEnum: WireRK = "future";
// @ts-expect-error RK28: generated definition carries exact optionality
const badWireHit: WireHit = { ...old, refKind: undefined };
const badItem = { ...old, refKind: false };
// @ts-expect-error RK29: method-specific response preserves nested field typing
const badResponse: Response = { ...response, result: { items: [badItem] } };
// @ts-expect-error RK30: Selection addresses remain mutually exclusive
const bothAddresses: SelectionItem = { ref: "object", def: "definition" };
// @ts-expect-error RK31: a definition address cannot carry object bits
const defBits: SelectionItem = { def: "d", bits: { lsb: 0, width: 1 } };
// @ts-expect-error RK32: a definition address cannot carry an object side
const defSide: SelectionItem = { def: "definition", side: "inside" };
// @ts-expect-error RK33: exact optional never does not allow explicit undefined ref
const defWithRef: SelectionItem = { def: "definition", ref: undefined };
// @ts-expect-error RK34: exact optional never does not allow explicit undefined def
const objectWithDef: SelectionItem = { ref: "object", def: undefined };
// @ts-expect-error RK35: no new Selection origin is invented by this proposal
const wrongOrigin: Selection = { ...selection, origin: "candidate" };
// @ts-expect-error RK36: existing optional snapshot remains exact
const missingSnapshot: Selection = { ...selection, snapshotId: undefined };
// @ts-expect-error RK37: SDK Reply projection keeps nested fields readonly
reply.result.items[0]!.refKind = "object";
// @ts-expect-error RK38: SDK Reply items remain readonly
reply.result.items.push(tagged);
// @ts-expect-error RK39: candidate pages keep the SDK readonly projection
candidatePage.result.items[0]!.refKind = "definition";
// @ts-expect-error RK40: address kind and source kind are independent unions
const conflatedKind: SourceKind = addressKind;

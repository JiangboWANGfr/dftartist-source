import {
  SourceView,
  type SourceViewProps,
  type SourceViewPositionFailure,
  type SourceViewPositionQuery,
  VIEWS_PROTOCOL_VERSION,
} from "@hier/views";
import type {
  SourceDocument,
  SourceDocumentState,
  SourceNavigationModel,
} from "@hier/viewmodel";
import type { ReactElement } from "react";

declare const state: SourceDocumentState;
declare const document: SourceDocument;
declare const nav: SourceNavigationModel;
declare const raw: unknown;
declare const failure: SourceViewPositionFailure;
declare const query: SourceViewPositionQuery;
declare const props: SourceViewProps;
type Query = SourceViewPositionQuery;
type Failure = SourceViewPositionFailure;
type ErrorOnly = { error: Error };

// The previous four-property consumer remains valid without a query group.
interface LegacyProps {
  readonly state: SourceDocumentState;
  readonly ariaLabel: string;
  readonly height: number;
  readonly className?: string;
}
const legacy: LegacyProps = { state, ariaLabel: "B 源码", height: 200 };
const compatible: SourceViewProps = legacy;
const oldSurface: LegacyProps = props;
const out: ReactElement = SourceView(compatible);
const oldWithClass: SourceViewProps = { ...legacy, className: "" };
const protocol: 2 = VIEWS_PROTOCOL_VERSION;

const group: SourceViewPositionQuery = {
  locate: (doc, offset) => {
    const originalDocument: SourceDocument = doc;
    const originalOffset: number = offset;
    return nav.locate(originalDocument, originalOffset);
  },
  onError: (value) => {
    const originalDocument: SourceDocument = value.document;
    const originalOffset: number = value.utf16Offset;
    const originalError: unknown = value.error;
    void [originalDocument, originalOffset, originalError];
  },
};
const interactive: SourceViewProps = { ...legacy, positionQuery: group };
const rendered: ReactElement = SourceView(interactive);
const completion: Promise<void> = query.locate(document, 0);
const returnedVoid: void = query.onError(failure);
const captured: SourceViewPositionFailure = {
  document,
  utf16Offset: 0,
  error: raw,
};
const undefinedFailure: SourceViewPositionFailure = {
  document,
  utf16Offset: 0,
  error: undefined,
};
const primitiveFailure: SourceViewPositionFailure = {
  document,
  utf16Offset: 0,
  error: Symbol("B original thrown value"),
};
const asyncLocate: SourceViewPositionQuery = {
  locate: async () => {},
  onError: () => {},
};
// A void callback may return a value, including a Promise; it is not awaited.
const ignoredReturn: SourceViewPositionQuery = {
  locate: group.locate,
  onError: () => 3,
};
const hostAsyncResponsibility: SourceViewPositionQuery = {
  locate: group.locate,
  onError: async () => {},
};
// Callers need not freeze their object to satisfy the readonly borrowed shape.
const mutableGroup = { locate: group.locate, onError: group.onError };
const acceptedMutable: SourceViewPositionQuery = mutableGroup;
void [
  oldSurface,
  out,
  oldWithClass,
  protocol,
  rendered,
  completion,
  returnedVoid,
  captured,
  undefinedFailure,
  primitiveFailure,
  asyncLocate,
  ignoredReturn,
  hostAsyncResponsibility,
  acceptedMutable,
];

// @ts-expect-error SPI01: exact optional excludes explicit undefined query
SourceView({ ...legacy, positionQuery: undefined });
// @ts-expect-error SPI02: a provided query cannot be null
SourceView({ ...legacy, positionQuery: null });
// @ts-expect-error SPI03: the callback group is not a primitive
SourceView({ ...legacy, positionQuery: "query" });
// @ts-expect-error SPI04: locate and onError are required as a group
SourceView({ ...legacy, positionQuery: { locate: group.locate } });
// @ts-expect-error SPI05: onError without locate is not a query group
SourceView({ ...legacy, positionQuery: { onError: group.onError } });
// @ts-expect-error SPI06: required locate cannot be undefined
const undefinedLocate: Query = { ...group, locate: undefined };
// @ts-expect-error SPI07: required onError cannot be undefined
const undefinedHandler: Query = { ...group, onError: undefined };
// @ts-expect-error SPI08: locate must be a function
const numericLocate: Query = { ...group, locate: 1 };
// @ts-expect-error SPI09: onError must be a function
const numericHandler: Query = { ...group, onError: 1 };
// @ts-expect-error SPI10: the static locate result is Promise<void>, not void
const syncLocate: Query = { ...group, locate: () => {} };
// @ts-expect-error SPI11: a synchronous numeric result is not Promise<void>
const numberLocate: Query = { ...group, locate: () => 3 };
// @ts-expect-error SPI12: Promise<number> is not the declared completion type
const valueLocate: Query = { ...group, locate: async () => 3 };
declare const unknownCompletion: Promise<unknown>;
// @ts-expect-error SPI13: unknown completion does not guarantee void
const unknownLocate: Query = { ...group, locate: () => unknownCompletion };
declare const dynamicThenable: PromiseLike<void>;
// @ts-expect-error SPI14: dynamic thenables are not the public Promise signature
const thenableLocate: Query = { ...group, locate: () => dynamicThenable };
// @ts-expect-error SPI15: locate receives a SourceDocument, not state
query.locate(state, 0);
// @ts-expect-error SPI16: locate does not accept a null document
query.locate(null, 0);
// @ts-expect-error SPI17: locate requires the original document argument
query.locate(undefined, 0);
// @ts-expect-error SPI18: a UTF-16 offset is numeric, not text
query.locate(document, "0");
// @ts-expect-error SPI19: the offset argument cannot be undefined
query.locate(document, undefined);
// @ts-expect-error SPI20: the offset argument is required
query.locate(document);
// @ts-expect-error SPI21: there is no cancellation/options argument here
query.locate(document, 0, {});
// @ts-expect-error SPI22: the failure callback accepts the complete failure
query.onError({ error: raw });
// @ts-expect-error SPI23: failure callbacks cannot require Error-only errors
const narrowHandler: Query = { ...group, onError: (f: ErrorOnly) => {} };
// @ts-expect-error SPI24: failure document is required
const noDocument: Failure = { utf16Offset: 0, error: raw };
// @ts-expect-error SPI25: failure offset is required
const noOffset: Failure = { document, error: raw };
// @ts-expect-error SPI26: failure error is present even when its value is undefined
const noError: Failure = { document, utf16Offset: 0 };
// @ts-expect-error SPI27: failure document is not nullable
const nullDocument: Failure = { document: null, utf16Offset: 0, error: raw };
// @ts-expect-error SPI28: failure offset remains numeric
const stringOffset: Failure = { document, utf16Offset: "0", error: raw };
// @ts-expect-error SPI29: the borrowed raw failure is unknown, not Error
const assumedError: Error = failure.error;
// @ts-expect-error SPI30: unknown failures cannot be read as message objects
const assumedMessage = failure.error.message;
// @ts-expect-error SPI31: unknown failures cannot be read as Core codes
const assumedCode = failure.error.code;
// @ts-expect-error SPI32: the borrowed raw failure is not necessarily text
const assumedText: string = failure.error;
// @ts-expect-error SPI33: the failure document field is readonly
failure.document = document;
// @ts-expect-error SPI34: the failure offset field is readonly
failure.utf16Offset = 1;
// @ts-expect-error SPI35: the failure error field is readonly
failure.error = raw;
// @ts-expect-error SPI36: the configuration locate field is readonly
query.locate = group.locate;
// @ts-expect-error SPI37: the configuration onError field is readonly
query.onError = group.onError;
// @ts-expect-error SPI38: the optional configuration field is readonly
props.positionQuery = group;
// @ts-expect-error SPI39: old className exact-optional behavior stays strict
SourceView({ ...legacy, className: undefined });
// @ts-expect-error SPI40: old required state behavior remains unchanged
SourceView({ ariaLabel: "B", height: 200, positionQuery: group });
// @ts-expect-error SPI41: old label type remains unchanged
SourceView({ ...legacy, ariaLabel: 3, positionQuery: group });
// @ts-expect-error SPI42: old height type remains unchanged
SourceView({ ...legacy, height: "200", positionQuery: group });

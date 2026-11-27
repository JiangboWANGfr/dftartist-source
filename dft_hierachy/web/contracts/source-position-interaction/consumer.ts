import { createElement, type ReactElement } from "react";
import type { SourceDocument, SourceNavigationModel } from "@hier/viewmodel";
import {
  SourceView as ProductionSourceView,
  type SourceViewProps as ReadonlyProps,
} from "@hier/views";
import {
  SourceView,
  type SourceViewProps,
  type SourceViewPositionQuery,
  type SourceViewPositionFailure,
} from "./proposal.js";

declare const navigation: SourceNavigationModel;
declare const document: SourceDocument;
declare const old: ReadonlyProps;
declare const failure: SourceViewPositionFailure;
declare const report: (error: unknown) => void;

// The host keeps this object stable until it changes its receiver session.
const positionQuery: SourceViewPositionQuery = {
  locate: (shown, offset) => navigation.locate(shown, offset),
  onError: (failure) => report(failure.error),
};
const props: SourceViewProps = { ...old, positionQuery };
const compatible: SourceViewProps = old;
const interactive: ReactElement = createElement(SourceView, props);
const readonly: ReactElement = createElement(SourceView, old);
const observed: Promise<void> = positionQuery.locate(document, 0);
const borrowed: SourceDocument = failure.document;
const unknownError: unknown = failure.error;
void [compatible, interactive, readonly, observed, borrowed, unknownError];

// @ts-expect-error I01 omission and explicit undefined differ
SourceView({ ...old, positionQuery: undefined });
// @ts-expect-error I02 null is not a configuration
SourceView({ ...old, positionQuery: null });
// @ts-expect-error I03 error handling is required with locate
SourceView({ ...old, positionQuery: { locate: positionQuery.locate } });
// @ts-expect-error I04 locate is required with error handling
SourceView({ ...old, positionQuery: { onError: positionQuery.onError } });
// @ts-expect-error I05 locate must return an observable Promise
SourceView({ ...old, positionQuery: { ...positionQuery, locate: () => {} } });
// @ts-expect-error I06 locate receives a published document, not a state
positionQuery.locate(navigation.state.document, 0);
// @ts-expect-error I07 offset is numeric UTF-16, not a string
positionQuery.locate(document, "1");
// @ts-expect-error I08 error is unknown until the host chooses to inspect it
const errorMessage: string = failure.error.message;
// @ts-expect-error I09 failure data is readonly
failure.document = document;
// @ts-expect-error I10 failure offset is readonly
failure.utf16Offset = 2;
// @ts-expect-error I11 failure error is readonly
failure.error = null;
// @ts-expect-error I12 configuration cannot be mutated
positionQuery.locate = (shown, offset) => navigation.locate(shown, offset);
// @ts-expect-error I13 report callback cannot be mutated
positionQuery.onError = report;
// @ts-expect-error I14 view props are readonly
props.positionQuery = positionQuery;
// @ts-expect-error I15 no model ownership prop
SourceView({ ...props, model: navigation });
// @ts-expect-error I16 failure callback is part of the explicit query group
SourceView({ ...props, onCommandError: report });
// @ts-expect-error I17 source location does not commit a semantic Selection
SourceView({ ...props, selection: {} });
// @ts-expect-error I18 UI range replacement remains unsupported
SourceView({ ...props, range: [0, 1] });
// @ts-expect-error I19 original required height remains required
SourceView({ state: old.state, ariaLabel: old.ariaLabel, positionQuery });
// @ts-expect-error I20 new interaction has deliberately not shipped in production
ProductionSourceView({ ...old, positionQuery });
void errorMessage;

import { createElement, type ReactElement } from "react";
import type {
  SourceDocument,
  SourceDocumentModel,
  SourceDocumentState,
  SourceNavigationModel,
} from "@hier/viewmodel";
import { SourceView, type SourceViewProps } from "./m5-source-view.js";

declare const navigation: SourceNavigationModel;
declare const documentModel: SourceDocumentModel;
declare const document: SourceDocument;
declare const state: SourceDocumentState;

// Compile-only render examples. The host owns the subscription and passes the
// current published value; this consumer is never executed as a UI or host.
const props: SourceViewProps = {
  state: navigation.state.document,
  ariaLabel: "模块源码",
  height: 360,
};
const element: ReactElement = createElement(SourceView, props);
const standalone: ReactElement = createElement(SourceView, {
  state: documentModel.state,
  ariaLabel: "定义源码",
  height: 240,
  className: "source-panel",
});
const idle: SourceDocumentState = { status: "idle", target: null };
const idleProps: SourceViewProps = { ...props, state: idle };
const sameState: SourceDocumentState = props.state;

// No new state or coordinate DTO: existing public values flow through directly.
function displayFields(value: SourceDocumentState): readonly string[] {
  switch (value.status) {
    case "idle":
    case "pending":
      return [value.status];
    case "failed":
    case "cancelled":
      return [
        value.status,
        value.error.origin,
        value.error.code,
        value.error.message,
      ];
    case "success":
      if (value.data.location.status === "changed")
        return [value.data.content.result.text, "源码已变化，位置可能不准"];
      return [
        value.data.content.result.text,
        String(value.data.location.range.start.offset),
        String(value.data.location.range.end.offset),
      ];
  }
}
void [element, standalone, idleProps, sameState, displayFields];

// @ts-expect-error V01 published state is required
const invalid01: SourceViewProps = { ariaLabel: "source", height: 100 };
// @ts-expect-error V02 an accessible name is required
const invalid02: SourceViewProps = { state, height: 100 };
// @ts-expect-error V03 an explicit component height is required
const invalid03: SourceViewProps = { state, ariaLabel: "source" };
// @ts-expect-error V04 height is numeric CSS pixels, not a CSS string
const invalid04: SourceViewProps = { ...props, height: "100%" };
// @ts-expect-error V05 a coordinator is not a document state
const invalid05: SourceViewProps = { ...props, state: navigation };
// @ts-expect-error V06 a model is not a document state
const invalid06: SourceViewProps = { ...props, state: documentModel };
// @ts-expect-error V07 a raw document is not a discriminated state
const invalid07: SourceViewProps = { ...props, state: document };
// @ts-expect-error V08 pending is an explicit state, not a Promise input
const invalid08: SourceViewProps = { ...props, state: Promise.resolve(state) };
// @ts-expect-error V09 SourceView does not own or accept an SDK
const invalid09: SourceViewProps = { ...props, client: {} };
// @ts-expect-error V10 SourceView does not own or subscribe to a model
const invalid10: SourceViewProps = { ...props, model: documentModel };
// @ts-expect-error V11 source reads are host commands, not view callbacks
const invalid11: SourceViewProps = { ...props, onLoad: () => {} };
// @ts-expect-error V12 source click navigation is a later contract
const invalid12: SourceViewProps = { ...props, onLocate: () => {} };
// @ts-expect-error V13 selection is not an input to read-only display
const invalid13: SourceViewProps = { ...props, selection: {} };
// @ts-expect-error V14 the view has no replacement source text input
const invalid14: SourceViewProps = { ...props, text: "replacement" };
// @ts-expect-error V15 ranges come from the published document location
const invalid15: SourceViewProps = { ...props, range: [0, 1] };
// @ts-expect-error V16 consumers cannot replace borrowed props state
props.state = idle;
// @ts-expect-error V17 published state is readonly through the view boundary
props.state.status = "idle";
// @ts-expect-error V18 absence and undefined remain distinct for optional props
const invalid16: SourceViewProps = { ...props, className: undefined };
// @ts-expect-error V19 the state union is reused without an extra loading status
const invalid17: SourceDocumentState = { status: "loading", target: null };
// @ts-expect-error V20 SourceView returns a React element, not an async task
const invalid18: (props: SourceViewProps) => Promise<ReactElement> = SourceView;
void [
  invalid01,
  invalid02,
  invalid03,
  invalid04,
  invalid05,
  invalid06,
  invalid07,
  invalid08,
  invalid09,
  invalid10,
  invalid11,
  invalid12,
  invalid13,
  invalid14,
  invalid15,
  invalid16,
  invalid17,
  invalid18,
];

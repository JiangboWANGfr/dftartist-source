import {
  SourceView,
  type SourceViewProps,
  VIEWS_PROTOCOL_VERSION,
} from "@hier/views";
import type {
  SourceDocumentState,
  SourceNavigationModel,
} from "@hier/viewmodel";
import type { ReactElement } from "react";
declare const current: SourceDocumentState;
const props: SourceViewProps = {
  state: current,
  ariaLabel: "B 源码",
  height: 280,
};
const out: ReactElement = SourceView(props);
const protocol: 2 = VIEWS_PROTOCOL_VERSION;
const withClass: SourceViewProps = { ...props, className: "" };
const documentState: SourceDocumentState = props.state;
declare const nav: SourceNavigationModel;
SourceView({ state: nav.state.document, ariaLabel: "navigation", height: 200 });
void [out, protocol, withClass, documentState];
// @ts-expect-error SV01: state required
SourceView({ ariaLabel: "B", height: 200 });
// @ts-expect-error SV02: ariaLabel required
SourceView({ state: current, height: 200 });
// @ts-expect-error SV03: height required
SourceView({ state: current, ariaLabel: "B" });
// @ts-expect-error SV04: state is public union, not model
SourceView({ state: nav, ariaLabel: "B", height: 200 });
// @ts-expect-error SV05: no async state
SourceView({ state: Promise.resolve(current), ariaLabel: "B", height: 200 });
// @ts-expect-error SV06: no custom source DTO
SourceView({ state: { text: "B" }, ariaLabel: "B", height: 200 });
// @ts-expect-error SV07: state not null
SourceView({ state: null, ariaLabel: "B", height: 200 });
// @ts-expect-error SV08: state not optional
SourceView({ state: undefined, ariaLabel: "B", height: 200 });
// @ts-expect-error SV09: numeric ariaLabel
SourceView({ state: current, ariaLabel: 1, height: 200 });
// @ts-expect-error SV10: boxed ariaLabel
SourceView({ state: current, ariaLabel: new String("B"), height: 200 });
// @ts-expect-error SV11: null ariaLabel
SourceView({ state: current, ariaLabel: null, height: 200 });
// @ts-expect-error SV12: height is numeric, no coercion
SourceView({ state: current, ariaLabel: "B", height: "200" });
// @ts-expect-error SV13: height not optional
SourceView({ state: current, ariaLabel: "B", height: undefined });
// @ts-expect-error SV14: boxed number height
SourceView({ state: current, ariaLabel: "B", height: new Number(200) });
// @ts-expect-error SV15: class primitive
SourceView({ ...props, className: [] });
// @ts-expect-error SV16: class null
SourceView({ ...props, className: null });
// @ts-expect-error SV17: optional exact excludes explicit undefined at type level only
SourceView({ ...props, className: undefined });
// @ts-expect-error SV18: readonly props state
props.state = current;
// @ts-expect-error SV19: readonly label
props.ariaLabel = "other";
// @ts-expect-error SV20: readonly height
props.height = 300;
// @ts-expect-error SV21: readonly class
props.className = "other";
// @ts-expect-error SV22: no SDK property
SourceView({ ...props, client: {} });
// @ts-expect-error SV23: no model property
SourceView({ ...props, model: nav });
// @ts-expect-error SV24: no command error callback
SourceView({ ...props, onCommandError: () => {} });
// @ts-expect-error SV25: no selection service
SourceView({ ...props, selection: {} });
// @ts-expect-error SV26: idle cannot retain data
SourceView({ ...props, state: { status: "idle", target: null, data: {} } });
// @ts-expect-error SV27: pending target required
SourceView({ ...props, state: { status: "pending" } });
// @ts-expect-error SV28: source error union cannot invent status
SourceView({ ...props, state: { status: "loading", target: null } });

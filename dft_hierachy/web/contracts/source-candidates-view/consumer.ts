import { createElement, type ReactElement } from "react";
import type {
  SourceNavigationModel,
  SelectionModel,
  SourceCandidateAction,
} from "@hier/viewmodel";
import { SourceView, type SourceViewProps } from "@hier/views";
import {
  SourceCandidatesView,
  type SourceCandidatesViewCommand,
  type SourceCandidatesViewFailure,
  type SourceCandidatesViewProps,
} from "./proposal.js";

declare const navigation: SourceNavigationModel;
declare const selection: SelectionModel;
declare const action: SourceCandidateAction;
declare const failure: SourceCandidatesViewFailure;
declare const report: (error: unknown) => void;
declare const wrongErrorHandler: (error: Error) => void;
const props: SourceCandidatesViewProps = {
  navigation,
  selection,
  ariaLabel: "源码候选",
  height: 320,
  onCommandError: (failure) => report(failure.error),
};
const candidateElement: ReactElement = createElement(
  SourceCandidatesView,
  props,
);
const sourceProps: SourceViewProps = {
  state: navigation.state.document,
  ariaLabel: "源码",
  height: 400,
  positionQuery: {
    locate: (document, offset) => navigation.locate(document, offset),
    onError: ({ error }) => report(error),
  },
};
const sourceElement: ReactElement = createElement(SourceView, sourceProps);
const command: SourceCandidatesViewCommand = failure.command;
const original: SourceCandidateAction | null = failure.action;
const unknownError: unknown = failure.error;
const oldSource: SourceViewProps = {
  state: sourceProps.state,
  ariaLabel: "只读源码",
  height: 200,
};
void [
  candidateElement,
  sourceElement,
  command,
  original,
  unknownError,
  oldSource,
];

// @ts-expect-error V01 navigation remains owned by the host, never optional
SourceCandidatesView({
  selection,
  ariaLabel: "x",
  height: 1,
  onCommandError: props.onCommandError,
});
// @ts-expect-error V02 confirmation requires an explicit target Selection
SourceCandidatesView({
  navigation,
  ariaLabel: "x",
  height: 1,
  onCommandError: props.onCommandError,
});
// @ts-expect-error V03 an error receiver is required
SourceCandidatesView({ navigation, selection, ariaLabel: "x", height: 1 });
// @ts-expect-error V04 accessible name is required
SourceCandidatesView({
  navigation,
  selection,
  height: 1,
  onCommandError: props.onCommandError,
});
// @ts-expect-error V05 component height is required
SourceCandidatesView({
  navigation,
  selection,
  ariaLabel: "x",
  onCommandError: props.onCommandError,
});
// @ts-expect-error V06 primitive numeric size
SourceCandidatesView({ ...props, height: "320" });
// @ts-expect-error V07 undefined className is not omission
SourceCandidatesView({ ...props, className: undefined });
// @ts-expect-error V08 null className is not omission
SourceCandidatesView({ ...props, className: null });
// @ts-expect-error V09 public classes have real private ownership, no duck model
SourceCandidatesView({ ...props, navigation: { state: navigation.state } });
// @ts-expect-error V10 selection target is a model, not a writable callback
SourceCandidatesView({ ...props, selection: { select() {} } });
// @ts-expect-error V11 cannot inject an alternate candidate state
SourceCandidatesView({ ...props, state: navigation.state });
// @ts-expect-error V12 cannot replace candidate actions with a copied address DTO
SourceCandidatesView({ ...props, items: [{ ref: "x" }] });
// @ts-expect-error V13 component must not take the SDK
SourceCandidatesView({ ...props, client: {} });
// @ts-expect-error V14 props are readonly
props.navigation = navigation;
// @ts-expect-error V15 target ownership is readonly
props.selection = selection;
// @ts-expect-error V16 failure command is readonly
failure.command = "confirm";
// @ts-expect-error V17 failure action remains the original readonly reference
failure.action = action;
// @ts-expect-error V18 failure error is readonly
failure.error = null;
// @ts-expect-error V19 host must narrow arbitrary error values
const message: string = failure.error.message;
// @ts-expect-error V20 no extra query or automatic selection command
const invalidCommand: SourceCandidatesViewCommand = "locate";
// @ts-expect-error V21 private action brand cannot be supplied as a structural DTO
const forged: SourceCandidateAction = {
  page: action.page,
  itemIndex: action.itemIndex,
};
// @ts-expect-error V22 existing SourceView keeps its original props, no model injection
SourceView({ ...oldSource, navigation });
// @ts-expect-error V23 onCommandError has typed failure input
SourceCandidatesView({ ...props, onCommandError: wrongErrorHandler });
// @ts-expect-error V24 no implicit callback default or undefined
SourceCandidatesView({ ...props, onCommandError: undefined });

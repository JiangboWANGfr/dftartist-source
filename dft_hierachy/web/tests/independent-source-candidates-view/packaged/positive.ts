import * as React from "react";
import {
  SourceCandidatesView,
  SourceView,
  VIEWS_PROTOCOL_VERSION,
  type SourceCandidatesViewProps,
  type SourceCandidatesViewCommand,
  type SourceCandidatesViewFailure,
} from "@hier/views";
import type { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
declare const navigation: SourceNavigationModel;
declare const selection: SelectionModel;
const props: SourceCandidatesViewProps = {
  navigation,
  selection,
  ariaLabel: "outside candidate",
  height: 240,
  onCommandError(failure) {
    const error: unknown = failure.error;
    const command: SourceCandidatesViewCommand = failure.command;
    void [error, command];
  },
};
const withClass: SourceCandidatesViewProps = { ...props, className: "outside" };
const element: React.ReactElement = SourceCandidatesView(withClass);
type Expected =
  | "bindActions"
  | "confirm"
  | "loadMore"
  | "reloadCandidates"
  | "cancelCandidates";
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type Commands = Assert<Equal<Expected, SourceCandidatesViewCommand>>;
const original: SourceCandidatesViewFailure = {
  command: "confirm",
  action: null,
  error: undefined,
};
const version: 2 = VIEWS_PROTOCOL_VERSION;
void [element, original, version, SourceView];
void (null as unknown as Commands);

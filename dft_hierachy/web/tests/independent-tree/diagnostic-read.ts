// Agent B strict public consumer, DESIGN 6.6.6 only; no cast/private hooks.
import { HierError, type HierClient } from "@hier/client";
import {
  TreeModel,
  type TreeDiagnosticIssue,
  type TreeFailure,
  type TreeErrorCode,
} from "@hier/viewmodel";
declare const client: HierClient;
const tree = new TreeModel(client);
const getterData: Readonly<Record<string, unknown>> = {
  get detail() {
    tree.dispose();
    return "B";
  },
};
new HierError("transport_closed", "transport", "B", getterData);
const throwingData: Readonly<Record<string, unknown>> = {
  get detail() {
    throw undefined;
  },
};
new HierError("transport_closed", "transport", "B", throwingData);
const issue: TreeDiagnosticIssue = {
  code: "data_read_failed",
  operation: "read",
  path: ["branch", "2", "a.b/c", ""],
};
const inspect: TreeDiagnosticIssue = {
  code: "data_read_failed",
  operation: "inspect",
  path: [],
};
const enumerate: TreeDiagnosticIssue = {
  code: "data_read_failed",
  operation: "enumerate",
  path: ["branch"],
};
const legacy: TreeFailure = {
  code: "transport_closed",
  origin: "transport",
  message: "B",
  data: {},
};
const extended: TreeFailure = { ...legacy, dataIssue: issue };
const possible: TreeDiagnosticIssue | undefined = extended.dataIssue;
void possible;
void inspect;
void enumerate;
const badCode: TreeDiagnosticIssue = {
  // @ts-expect-error D01: issue code is one exact literal
  code: "unreadable",
  operation: "read",
  path: [],
};
const badOperation: TreeDiagnosticIssue = {
  code: "data_read_failed",
  // @ts-expect-error D02: no invented get operation
  operation: "get",
  path: [],
};
const numericPath: TreeDiagnosticIssue = {
  code: "data_read_failed",
  operation: "read",
  // @ts-expect-error D03: array indexes in paths are string keys
  path: [0],
};
// @ts-expect-error D04: readonly path has no mutating push
issue.path.push("x");
// @ts-expect-error D05: readonly path elements
issue.path[0] = "x";
// @ts-expect-error D06: metadata code is readonly
issue.code = "data_read_failed";
// @ts-expect-error D07: failure issue slot is readonly
extended.dataIssue = issue;
// @ts-expect-error D08: path is mandatory
const noPath: TreeDiagnosticIssue = {
  code: "data_read_failed",
  operation: "read",
};
// @ts-expect-error D09: operation is mandatory
const noOperation: TreeDiagnosticIssue = { code: "data_read_failed", path: [] };
// @ts-expect-error D10: optional issue is not nullable
const nullable: TreeFailure = { ...legacy, dataIssue: null };
// @ts-expect-error D11: true omission, not explicit undefined
const undefinedIssue: TreeFailure = { ...legacy, dataIssue: undefined };
// @ts-expect-error D12: no new TreeErrorCode
const newErrorCode: TreeErrorCode = "data_read_failed";
const marker: TreeDiagnosticIssue = {
  code: "data_read_failed",
  operation: "read",
  path: [],
  // @ts-expect-error D13: no arbitrary thrown-value field in the published metadata
  thrown: new Error("B"),
};
// @ts-expect-error D14: readonly metadata operation
issue.operation = "enumerate";

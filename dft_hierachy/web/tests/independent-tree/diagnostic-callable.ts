// Agent B legal public inputs, no casts/private hooks. Callable behavior is not a Tree output promise.
import { HierError } from "@hier/client";
import type { TreeFailure } from "@hier/viewmodel";
const handler = Object.assign(function () {}, {
  detail: { value: 1 },
  scalar: "B",
});
const fields: Readonly<Record<string, unknown>> = {
  handler,
  handlers: [handler, handler],
  branch: { handler },
};
new HierError(
  "transport_closed",
  "transport",
  "B legal nested callable",
  fields,
);
const getterFields: Readonly<Record<string, unknown>> = {
  get handler() {
    return handler;
  },
};
new HierError("transport_closed", "transport", "B legal getter", getterFields);
interface CallableRecord {
  (): void;
  readonly [key: string]: unknown;
  readonly detail: { readonly value: number };
}
declare const rootCallable: CallableRecord;
new HierError(
  "transport_closed",
  "transport",
  "B legal root callable",
  rootCallable,
);
declare const failed: TreeFailure;
const projection: Readonly<Record<string, unknown>> = failed.data;
const capturedUnknown: unknown = projection.handler;
void capturedUnknown;

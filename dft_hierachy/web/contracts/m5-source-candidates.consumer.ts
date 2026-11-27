import type { HierClient, Reply, Unsubscribe } from "@hier/client";
import type { ResultOf } from "@hier/protocol-types";
import type { SourceDocument } from "@hier/viewmodel";
import {
  SourceCandidatesModel,
  SourceCandidatesError,
  type SourceCandidatesQuery,
  type SourceCandidatesState,
  type SourceCandidatesPage,
} from "./m5-source-candidates.js";

declare const client: HierClient;
declare const query: SourceCandidatesQuery;
declare const document: SourceDocument;
declare const page: Reply<ResultOf<"source.resolve">>;
const model = new SourceCandidatesModel(client, { pageSize: 100 });
const wholeLine: SourceCandidatesQuery = {
  snapshotId: client.snapshot.snapshotId,
  file: "f:0",
  line: 3,
};
const column = { ...wholeLine, col: 18 };
const originalPage: SourceCandidatesPage = page;
const state: SourceCandidatesState = model.state;
const pending: Promise<void>[] = [
  model.load(wholeLine),
  model.load(column),
  model.loadMore(),
  model.reload(),
  model.cancel(),
  model.clear(),
];
declare const report: (error: unknown) => void;
for (const command of pending) void command.catch(report);
const off: Unsubscribe = model.subscribe(() => {
  const current = model.state;
  if (current.status === "failed" || current.status === "cancelled")
    report(current.error);
  for (const p of current.pages) {
    const raw: Reply<ResultOf<"source.resolve">> = p;
    if (raw.completeness.status === "partial") report(raw.completeness);
  }
});
off();
const error = new SourceCandidatesError("snapshot_mismatch", "Wrong snapshot");
void [originalPage, state, query, error];

// Type wiring only: the future host owns event epochs and stale-work guards.
// schedule must defer outside notifications, recheck target/cancel/clear/dispose,
// and handle ready-before-partial. This declaration is NOT that implementation.
declare const schedule: (reload: () => Promise<void>) => void;
const offIndex = client.onIndexReady(() => {
  schedule(() => {
    const command = model.reload();
    void command.catch(report);
    return command;
  });
});
offIndex();
model.dispose(); // Borrowed client is still owned by the host.

// @ts-expect-error Q01 snapshot identity is required
model.load({ file: "f:0", line: 3 });
// @ts-expect-error Q02 editor text/document is not a snapshot query
model.load(document);
// @ts-expect-error Q03 current UTF-16 offset is not a query API
model.load({ snapshotId: "snapshot", file: "f:0", offset: 7 });
// @ts-expect-error Q04 explicit undefined column is not omitted
model.load({ ...wholeLine, col: undefined });
// @ts-expect-error Q05 numeric strings are not byte columns
model.load({ ...wholeLine, col: "18" });
// @ts-expect-error Q06 file is a FileRef string
model.load({ ...wholeLine, file: 4 });
// @ts-expect-error Q07 no caller-supplied cursor
model.loadMore("cursor");
// @ts-expect-error Q08 page size is numeric
new SourceCandidatesModel(client, { pageSize: "200" });
// @ts-expect-error Q09 fresh literal has no declared autoSelect option
new SourceCandidatesModel(client, { autoSelect: true });
// @ts-expect-error Q10 no automatic selection API
model.selectFirst();
// @ts-expect-error Q11 state is readonly
model.state = state;
// @ts-expect-error Q12 query is readonly
query.line = 9;
// @ts-expect-error Q13 pages cannot be appended by consumers
state.pages.push(page);
// @ts-expect-error Q14 raw candidate array is readonly
originalPage.result.items.push(originalPage.result.items[0]!);
// @ts-expect-error Q15 original completeness is readonly
originalPage.completeness.status = "complete";
const invalidSuccess = {
  status: "success" as const,
  query,
  pages: [],
  error: {
    code: "cancelled" as const,
    origin: "source_candidates" as const,
    message: "x",
    data: {},
  },
};
// @ts-expect-error Q16 success cannot carry a failure
const badSuccess: SourceCandidatesState = invalidSuccess;
// @ts-expect-error Q17 failed needs a diagnostic
const badFailure: SourceCandidatesState = {
  status: "failed",
  query,
  pages: [],
};
// @ts-expect-error Q18 idle cannot retain a target
const badIdle: SourceCandidatesState = { status: "idle", query, pages: [] };
// @ts-expect-error Q19 no guessed error code
new SourceCandidatesError("first_match", "x");
// @ts-expect-error Q20 load remains asynchronous
const synchronous: void = model.load(query);
void [badSuccess, badFailure, badIdle, synchronous];

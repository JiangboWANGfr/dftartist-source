// Legal wire + real public SDK/Nav/Selection. The single explicit SDK-return adapter
// has the DESIGN 6.17 / C30 accepted scope; it is NOT real Core/SDK cache behavior.
import {
  context,
  check,
  equal,
  complete,
  cursor,
} from "../pagination/public-model.mjs";
import { observePublicCalls } from "../pagination/public-calls.mjs";
import { bindings } from "../actions/assertions.mjs";
import { confirmation } from "./assertions.mjs";
export const names = [
  "createCandidateAction",
  "confirmCandidate",
  "loadMore",
  "reloadCandidates",
  "cancelCandidates",
];
export async function ready(classes) {
  const c = await context(classes);
  try {
    await c.n.load("B37/source", "definition");
    const doc = c.n.state.document.data,
      p = c.n.locate(doc, 0);
    p.catch(() => {});
    c.owned.push(p);
    const q = await c.next("source.resolve");
    c.items = [0, 1].map((i) => ({
      ref: "B37:original-" + i + "<&> 中文",
      kind: "definition",
      refKind: "object",
      span: doc.source.result,
    }));
    c.ok(q, { items: c.items, next: cursor }, complete);
    await p;
    c.page = c.n.state.candidates.state.pages[0];
    c.pages = [c.page];
    c.before = c.s.current;
    c.sentBefore = c.sent.length;
    c.document = doc;
    return c;
  } catch (e) {
    await c.close();
    throw e;
  }
}
export async function advance(c, mode, afterPending) {
  const previous = c.n.state,
    own = Object.getOwnPropertyDescriptor(c.client, "resolveSource");
  let calls = 0;
  if (mode === "same-reply")
    c.client.resolveSource = () => {
      calls++;
      return Promise.resolve(c.page);
    };
  try {
    const at = c.tap?.records.length,
      p = mode === "append" ? c.n.loadMore() : c.n.reloadCandidates();
    p.catch(() => {});
    c.owned.push(p);
    c.hostRecord = c.tap?.records[at];
    if (mode === "append") {
      const q = await c.next("source.resolve");
      equal(q.params.cursor, cursor, "host append uses original cursor");
      c.ok(q, { items: c.items }, complete);
    }
    if (mode === "reload-removed") {
      const q = await c.next("source.resolve");
      equal(
        c.n.state.candidates.state.status,
        "pending",
        "ordinary reload is pending before host answer",
      );
      equal(
        c.n.state.candidates.state.pages.length,
        0,
        "ordinary reload cleared the old page chain",
      );
      if (afterPending) await afterPending();
      c.ok(q, { items: c.items, next: cursor }, complete);
    }
    await p;
    check(c.n.state !== previous, "new published state");
    equal(c.n.state.document.data, c.document, "same original document");
    c.pages = c.n.state.candidates.state.pages;
    if (mode === "reload-removed") {
      check(
        c.pages[0] !== c.page,
        "ordinary noncached SDK reload has a new original Reply",
      );
      equal(
        JSON.stringify(c.pages[0].result.items),
        JSON.stringify(c.page.result.items),
        "new Reply has value-equal ordinary hits, not old row identity",
      );
    } else equal(c.pages[0], c.page, "same original first Reply identity");
    equal(c.pages.length, mode === "append" ? 2 : 1, "expected page chain");
    if (mode === "same-reply")
      equal(calls, 1, "exact one explicit SDK adapter call");
    equal(
      c.sent.length - c.sentBefore,
      mode === "same-reply" ? 0 : 1,
      "only explicit host transition query, no adapter wire request",
    );
    return { adapterCalls: calls };
  } finally {
    if (mode === "same-reply") {
      if (own) Object.defineProperty(c.client, "resolveSource", own);
      else
        check(
          Reflect.deleteProperty(c.client, "resolveSource"),
          "restore SDK method",
        );
    }
  }
}
export function selected(c, stale) {
  if (stale) {
    equal(
      c.s.current,
      c.before,
      "stale confirmation preserves selection identity",
    );
    equal(c.s.canGoBack, false, "stale confirmation does not write history");
  } else {
    equal(c.s.current.origin, "source", "original origin");
    equal(c.s.current.items.length, 1, "one item");
    equal(
      c.s.current.items[0].ref,
      c.page.result.items[0].ref,
      "original target",
    );
  }
}
export async function modelPremise(classes, mode) {
  const c = await ready(classes);
  let tap;
  const errors = [];
  try {
    c.tap = tap = observePublicCalls(c.n, names);
    const old = [
      c.n.createCandidateAction(c.page, 0),
      c.n.createCandidateAction(c.page, 1),
    ];
    bindings(tap.records, c.n, c.page);
    const transition =
      mode === "reload-removed"
        ? "reload-removed"
        : mode === "append-old"
          ? "append"
          : "same-reply";
    let emptyPendingObserved = false;
    const transitionInfo = await advance(c, transition, () => {
      emptyPendingObserved = true;
    });
    let action = old[0];
    if (mode === "same-current" || mode === "reload-removed")
      action = c.n.createCandidateAction(c.pages[0], 0);
    const stale = mode === "same-old";
    let caught;
    try {
      c.n.confirmCandidate(action, c.s);
    } catch (e) {
      caught = e;
    }
    equal(
      confirmation(tap.records, c.n, c.s, action, stale),
      caught,
      "raw thrown identity",
    );
    selected(c, stale);
    return {
      id: "B37-real-" + mode,
      pass: true,
      candidateUI: false,
      transition,
      oldActionUsed: action === old[0],
      stale,
      emptyPendingObserved,
      ...transitionInfo,
    };
  } finally {
    try {
      tap?.dispose();
    } catch (e) {
      errors.push(e);
    }
    try {
      errors.push(...(await c.close()));
    } catch (e) {
      errors.push(e);
    }
    check(
      errors.length === 0,
      "all real model cleanup attempted without error",
    );
  }
}

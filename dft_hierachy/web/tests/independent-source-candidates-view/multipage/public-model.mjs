// Real public models with B's existing legal wire; both pages exist before mounting any candidate UI.
import {
  context,
  complete,
  check,
  equal,
} from "../pagination/public-model.mjs";
export async function ready(classes) {
  const c = await context(classes);
  try {
    await c.n.load("B36/source", "definition");
    const document = c.n.state.document.data,
      span = document.source.result,
      hit = () => ({
        ref: "B36:same opaque<&> 中文",
        kind: "definition",
        refKind: "object",
        span,
      }),
      cursor = "B36 second page original cursor";
    const first = c.n.locate(document, 0);
    first.catch(() => {});
    c.owned.push(first);
    const q = await c.next("source.resolve");
    c.ok(q, { items: [hit(), hit()], next: cursor }, complete);
    await first;
    const more = c.n.loadMore();
    more.catch(() => {});
    c.owned.push(more);
    const tail = await c.next("source.resolve");
    equal(tail.params.cursor, cursor, "host loadMore uses original cursor");
    c.ok(tail, { items: [hit(), hit()] }, complete);
    await more;
    c.pages = c.n.state.candidates.state.pages;
    equal(c.pages.length, 2, "two legal original pages");
    check(c.pages[0] !== c.pages[1], "original page identities differ");
    for (const p of c.pages)
      equal(p.result.items.length, 2, "two occurrences per original page");
    const values = c.pages.flatMap((p) => p.result.items);
    for (const h of values)
      equal(
        JSON.stringify(h),
        JSON.stringify(values[0]),
        "ordinary legal input values are equal",
      );
    c.before = c.s.current;
    c.sentBefore = c.sent.length;
    return c;
  } catch (e) {
    await c.close();
    throw e;
  }
}
export function selected(c, count) {
  equal(
    c.sent.length,
    c.sentBefore,
    "no extra wire request after mount/activation",
  );
  if (!count) {
    equal(c.s.current, c.before, "semantic selection identity unchanged");
    return;
  }
  equal(c.s.current.origin, "source", "authoritative source origin");
  equal(c.s.current.items.length, 1, "one selected item");
  equal(
    c.s.current.items[0].ref,
    c.pages[0].result.items[0].ref,
    "original shared ref; identity must be checked separately",
  );
}

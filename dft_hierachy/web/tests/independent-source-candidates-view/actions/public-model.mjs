// Reuse B's frozen legal wire; never replace Navigation, Selection, SDK or candidate state.
import {
  context,
  check,
  equal,
  complete,
} from "../pagination/public-model.mjs";
export async function ready(classes) {
  const c = await context(classes);
  try {
    await c.n.load("B35/source", "definition");
    const document = c.n.state.document.data,
      p = c.n.locate(document, 0);
    p.catch(() => {});
    c.owned.push(p);
    const q = await c.next("source.resolve"),
      span = document.source.result;
    c.ok(
      q,
      {
        items: [
          {
            ref: "B35:original-zero<&>",
            kind: "definition",
            refKind: "object",
            span,
          },
          {
            ref: "B35:original-one 中文",
            kind: "definition",
            refKind: "object",
            span,
          },
        ],
      },
      complete,
    );
    await p;
    c.page = c.n.state.candidates.state.pages[0];
    c.before = c.s.current;
    c.sentBefore = c.sent.length;
    equal(c.page.result.items.length, 2, "two legal original items");
    return c;
  } catch (error) {
    await c.close();
    throw error;
  }
}
export function selected(c, index, count) {
  equal(c.sent.length, c.sentBefore, "no extra wire request");
  if (!count) {
    equal(c.s.current, c.before, "selection original identity unchanged");
    return;
  }
  equal(c.s.current.origin, "source", "authoritative source origin");
  equal(c.s.current.items.length, 1, "one authoritative item");
  equal(
    c.s.current.items[0].ref,
    c.page.result.items[index].ref,
    "original target ref",
  );
}

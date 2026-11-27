import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { real, releaseCore } from "../independent-source-candidates/core.mjs";
import { H, C, boot } from "./harness.mjs";
export { releaseCore };
export const coreCases = [];
async function completePages(m) {
  const complete = () =>
    m.state.candidates?.state.status === "success" &&
    m.state.candidates.state.pages.every(
      (p) => p.completeness.status === "complete",
    );
  if (!complete())
    await new Promise((resolve, reject) => {
      let off;
      const timer = setTimeout(() => {
        off?.();
        reject(Error("B real-chain wait watchdog, not SLA"));
      }, 10000);
      const check = () => {
        if (complete()) {
          clearTimeout(timer);
          off?.();
          resolve();
        } else if (
          ["failed", "cancelled"].includes(m.state.candidates?.state.status)
        ) {
          clearTimeout(timer);
          off?.();
          reject(Error("B unexpected real candidate failure"));
        }
      };
      off = m.subscribe(check);
      check();
    });
  for (let i = 0; i < 16; i++) {
    const s = m.state.candidates.state;
    if (s.pages.at(-1).result.next === undefined) break;
    await m.loadMore();
  }
  const s = m.state.candidates.state;
  assert.equal(s.status, "success");
  assert.equal(s.pages.at(-1).result.next, undefined);
  return s.pages;
}
for (const kind of ["CRLF", "LF", "macro"])
  for (const pageSize of [1, 2, 200])
    coreCases.push({
      id: "SN-CORE-" + kind + "-" + pageSize,
      group: "real-chain",
      input: { fixture: kind, pageSize, offset: "B literal statement start" },
      expected:
        "real owned document→locate→all five original B Core occurrences with page Reply identity, reload invalidates binding/new wrapper",
      basis:
        "DESIGN §6.13/§5.5.6; original B HDL and independent connectivity refs",
      run: () =>
        real(kind, false, async (c) => {
          const m = new H.vm.SourceNavigationModel(c.client, { pageSize });
          c.models.push(m);
          await m.load(c.children[0].ref, "definition");
          const d = m.state.document.data;
          assert.equal(d.content.result.text, c.leaf);
          assert.equal(d.location.status, "exact");
          const offset = c.leaf.indexOf(c.statement);
          assert.ok(offset >= 0);
          await m.locate(d, offset);
          const pages = await completePages(m);
          for (const p of pages) assert.ok(c.calls.some((x) => x.reply === p));
          c.exact(pages.flatMap((p) => p.result.items));
          assert.equal(m.state.candidates.document, d);
          const old = pages;
          await m.reloadDocument();
          const fresh = m.state.document.data;
          assert.notEqual(fresh, d);
          assert.equal(m.state.candidates, null);
          await assert.rejects(
            m.locate(d, offset),
            (e) =>
              e instanceof H.vm.SourcePositionError &&
              e.code === "stale_document",
          );
          await m.locate(fresh, offset);
          const again = await completePages(m);
          c.exact(again.flatMap((p) => p.result.items));
          assert.notEqual(again, old);
          m.dispose();
          assert.ok(await c.client.info());
        }),
    });
coreCases.push({
  id: "SN-CORE-disk-reload",
  group: "real-chain",
  input: { fixture: "CRLF", edit: "replace then restore leaf" },
  expected:
    "disk alone keeps prior publication; reload changed clears binding and rejects click; restore creates fresh document, old wrapper stale",
  basis: "DESIGN §6.13.2/§6.12.2; B source bytes",
  run: () =>
    real("CRLF", false, async (c) => {
      const m = new H.vm.SourceNavigationModel(c.client, { pageSize: 2 });
      c.models.push(m);
      await m.load(c.children[0].ref, "definition");
      const d = m.state.document.data,
        offset = c.leaf.indexOf(c.statement);
      await fs.writeFile(path.join(c.dir, c.leafName), "// B changed disk\r\n");
      await m.locate(d, offset);
      c.exact((await completePages(m)).flatMap((p) => p.result.items));
      await m.reloadDocument();
      assert.equal(m.state.document.data.location.status, "changed");
      assert.equal(m.state.candidates, null);
      await assert.rejects(
        m.locate(m.state.document.data, undefined),
        (e) => e.code === "changed_document",
      );
      await fs.writeFile(path.join(c.dir, c.leafName), c.leaf);
      await m.reloadDocument();
      const fresh = m.state.document.data;
      await assert.rejects(
        m.locate(d, offset),
        (e) => e.code === "stale_document",
      );
      await m.locate(fresh, offset);
      c.exact((await completePages(m)).flatMap((p) => p.result.items));
    }),
});

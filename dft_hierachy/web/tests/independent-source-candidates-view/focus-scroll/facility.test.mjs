import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cases } from "./cases.mjs";
import {
  sameScroll,
  retained,
  logicalFocus,
  FixturePremiseError,
} from "./assertions.mjs";
import { modelControl } from "./public-model.mjs";
test("B41 six unique input/expected/basis records", () => {
  assert.equal(cases.length, 6);
  assert.equal(new Set(cases.map((c) => c.id)).size, 6);
  for (const c of cases) {
    assert(c.input);
    assert(c.expected);
    assert.match(c.basis, /^DESIGN/);
  }
});
const base = () =>
  ["window", "parent", "source"].map((name) => ({ name, top: 40, left: 20 }));
test("B41 scroll accepts unchanged nonzero scopes", () =>
  sameScroll(base(), base()));
for (const name of ["window", "parent", "source"])
  for (const key of ["top", "left"])
    test("B41 rejects " + name + " " + key, () => {
      const after = base();
      after.find((x) => x.name === name)[key]++;
      assert.throws(() => sameScroll(base(), after), /unchanged/);
    });
const port = () => ({
  top: 40,
  left: 20,
  width: 300,
  height: 150,
  maxTop: 1000,
  maxLeft: 200,
});
test("B41 retained accepts no-clipping append", () =>
  retained(port(), { ...port(), maxTop: 1100 }));
test("B41 changed geometry is premise not product verdict", () =>
  assert.throws(
    () => retained(port(), { ...port(), height: 140 }),
    FixturePremiseError,
  ));
test("B41 clipping is premise not product verdict", () =>
  assert.throws(
    () => retained(port(), { ...port(), maxTop: 20 }),
    FixturePremiseError,
  ));
test("B41 logical focus accepts original page/index", () =>
  logicalFocus("page9/index0", "page9/index0"));
test("B41 logical focus rejects replacement tuple", () =>
  assert.throws(
    () => logicalFocus("page10/index0", "page9/index0"),
    /logical tuple/,
  ));
for (const mode of ["append", "empty"])
  test("B41 real SDK/model " + mode, async () => {
    const P = process.env.HIER_B_PRODUCT_ROOT;
    assert(P && path.isAbsolute(P), "explicit fixed product");
    const client = await import(
      pathToFileURL(P + "/web/packages/client/dist/index.js")
    );
    const model = await import(
      pathToFileURL(P + "/web/packages/viewmodel/dist/index.js")
    );
    assert.equal(
      (await modelControl({ ...client, ...model }, mode)).pass,
      true,
    );
  });

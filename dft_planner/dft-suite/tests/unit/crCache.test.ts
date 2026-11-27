// The clock/reset views are unmounted whenever the user switches the top nav, so the analysis
// and the expanded-hierarchy set MUST live outside component state. Reported symptom:
// "clock_tree 切换过程会把之前的tree图丢失掉" — the expanded tree snapped back to the top view.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crCacheGet, crCacheHas, crCacheSet, crExpandedGet, crExpandedSet, crKey,
} from "../../src/hierarchy/core/crCache.ts";
import type { ClockResetTreeResult } from "../../src/core-bridge/model.ts";

const result = (n: number): ClockResetTreeResult =>
  ({ items: new Array(n).fill(null).map(() => ({})) as never, clocks: [], sdcErrors: [] });

test("analysis is cached per (sdc, lib) so a remount reuses it instead of re-running the walk", () => {
  assert.equal(crCacheHas("/tmp/func.sdc", "/l.yaml"), false);
  crCacheSet("/tmp/func.sdc", "/l.yaml", result(146));

  // same inputs -> restored (this is what stops the view being discarded on tab switch)
  assert.equal(crCacheHas("/tmp/func.sdc", "/l.yaml"), true);
  assert.equal(crCacheGet("/tmp/func.sdc", "/l.yaml")?.items.length, 146);

  // DIFFERENT inputs must NOT hit — an unconstrained run and a constrained one are not
  // interchangeable (the empty-SDC run reports every clock group as a violation).
  assert.equal(crCacheHas("", "/l.yaml"), false);
  assert.equal(crCacheHas("/tmp/func.sdc", ""), false);
  // ...and the key must not let a different split collide
  assert.notEqual(crKey("a b", "c"), crKey("a", "b c"));
});

test("expansion is per view seed and survives, so clock and reset keep their own tree", () => {
  assert.deepEqual([...crExpandedGet("crsch:clock")], []);

  crExpandedSet("crsch:clock", new Set(["processor_core.PROCESSOR_1"]));
  assert.deepEqual([...crExpandedGet("crsch:clock")], ["processor_core.PROCESSOR_1"]);
  // the reset view is untouched by the clock view's expansion
  assert.deepEqual([...crExpandedGet("crsch:reset")], []);

  crExpandedSet("crsch:reset", new Set(["processor_core.GPIO_1"]));
  assert.deepEqual([...crExpandedGet("crsch:clock")], ["processor_core.PROCESSOR_1"]);
  assert.deepEqual([...crExpandedGet("crsch:reset")], ["processor_core.GPIO_1"]);

  // a fresh (never-expanded) seed hands back an empty set, not undefined
  assert.ok(crExpandedGet("crsch:nope") instanceof Set);
});

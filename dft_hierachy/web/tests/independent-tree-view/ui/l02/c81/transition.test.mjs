import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { transitionSource } from "./transition-source.mjs";
for (const kind of ["unmount", "replace", "remount"]) {
  test(`C81 actual transition host calls: ${kind}`, () => {
    const calls = [],
      old = {},
      replacement = {},
      roots = new Map([[1, { root: {}, c: old }]]);
    const bindings = {
      active: old,
      uiViews: roots,
      l02Witness: { read: () => ({ mountToken: 1 }) },
      uiUnmount(n) {
        calls.push("unmount");
        roots.delete(n);
      },
      uiMount(options, n) {
        calls.push("mount");
        const v = roots.get(n) ?? { root: {} };
        v.c = bindings.active;
        roots.set(n, v);
      },
    };
    const actual = vm.runInNewContext(`(${transitionSource()})`, bindings);
    const state = { c: old, replacement };
    actual(state, kind);
    assert.deepEqual(
      calls,
      kind === "replace"
        ? ["mount"]
        : kind === "unmount"
          ? ["unmount"]
          : ["unmount", "mount"],
    );
    assert.equal(bindings.active, kind === "replace" ? replacement : old);
    assert.equal(state.transitioned, true);
  });
}

export const cases = [
  ["direct-dual", 1, 1, 0, 0],
  ["native-await", 1, 1, 0, 0],
  ["empty-forward", 1, 0, 0, 1],
  ["success-only", 1, 0, 1, 0],
  ["reject-only", 1, 0, 1, 0],
  ["two-success", 2, 0, 2, 0],
  ["split-handlers", 2, 0, 2, 0],
  ["microtask-late", 0, 0, 0, 0],
  ["sync-invalidated", 0, 0, 0, 0],
  ["feedback-suppressed", 0, 0, 0, 0],
  ["no-consumer", 0, 0, 0, 0],
  ["internal-dual-only", 0, 0, 0, 0],
  ["fulfilled-direct", null, null, null, null],
  ["rejected-direct", null, null, null, null],
].map(([id, newReactions, dual, single, empty]) => ({
  id,
  input:
    id +
    " original same-realm native Promise with known prior internal handling",
  expected:
    newReactions === null
      ? { status: "unsupported-settled" }
      : { status: "pending-structure-only", newReactions, dual, single, empty },
  basis: "DESIGN §6.18.5/6; native facility diagnostics, NOT component oracle",
}));

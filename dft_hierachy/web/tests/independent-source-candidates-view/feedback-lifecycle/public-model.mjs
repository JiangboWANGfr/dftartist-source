import { ready } from "../sync-feedback/public-model.mjs";
import { check, equal } from "./assertions.mjs";
export { ready };
export function committed(c, indices, errors) {
  equal(
    c.notifications.length,
    indices.length,
    "one real notification for each explicit confirmation",
  );
  equal(errors.length, indices.length, "one original throw per confirmation");
  c.notifications.forEach((n, i) => {
    equal(n.i, 0, "one original host listener");
    equal(n.value.items.length, 1, "one selected item per immutable commit");
    equal(
      n.value.items[0].ref,
      c.page.result.items[indices[i]].ref,
      "original target at each commit",
    );
    equal(n.value.origin, "source", "source origin");
    equal(n.value.snapshotId, c.n.snapshotId, "bound snapshot");
    check(
      errors[i] instanceof AggregateError,
      "original notification AggregateError",
    );
    equal(errors[i].errors.length, 1, "one listener throw");
    equal(
      errors[i].errors[0],
      c.listenerErrors[0],
      "raw listener throw identity",
    );
  });
  equal(
    c.s.current,
    c.notifications.at(-1).value,
    "current is last original committed value",
  );
  equal(c.s.canGoBack, true, "history not rolled back");
  equal(c.s.canGoForward, false, "no forward move");
  equal(c.n.disposed, false, "borrowed navigation live");
  equal(c.s.disposed, false, "borrowed Selection live");
  equal(c.sent.length, c.sentBefore, "no extra wire query/cancel");
}
export async function modelControl(classes) {
  const c = await ready(classes);
  try {
    const issued = [0, 1].map((i) => c.n.createCandidateAction(c.page, i)),
      errors = [];
    for (const action of issued) {
      let didThrow = false;
      try {
        c.n.confirmCandidate(action, c.s);
      } catch (error) {
        errors.push(error);
        didThrow = true;
      }
      check(didThrow, "each actual confirmation throws after commit");
    }
    committed(c, [0, 1], errors);
    return {
      id: "B43-real-consecutive-confirmation-premise",
      pass: true,
      candidateUI: false,
      confirmations: 2,
      notifications: 2,
    };
  } finally {
    equal((await c.close()).length, 0, "owned model resources released");
  }
}

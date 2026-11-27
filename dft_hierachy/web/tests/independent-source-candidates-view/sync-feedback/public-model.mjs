import { ready as originalReady, selected } from "../actions/public-model.mjs";
import { check, equal } from "./assertions.mjs";
export { selected };
export async function ready(classes, { listeners = 1 } = {}) {
  const c = await originalReady(classes),
    close = c.close;
  c.stops = [];
  c.notifications = [];
  c.listenerErrors = [];
  c.close = async () => {
    const errors = [];
    for (const stop of c.stops.splice(0))
      try {
        stop();
      } catch (error) {
        errors.push({ label: "host Selection unsubscribe", error });
      }
    return [...errors, ...(await close())];
  };
  try {
    for (let i = 0; i < listeners; i++) {
      const error = Object.freeze({
        B42: "original Selection listener throw",
        i,
      });
      c.listenerErrors.push(error);
      c.stops.push(
        c.s.subscribe((value) => {
          c.notifications.push({ i, value });
          throw error;
        }),
      );
    }
    return c;
  } catch (error) {
    await c.close();
    throw error;
  }
}
export function committed(c, originalError) {
  selected(c, 0, 1);
  check(c.s.current !== c.before, "new committed Selection identity");
  equal(c.s.canGoBack, true, "one committed history move");
  equal(c.s.canGoForward, false, "no forward history");
  equal(
    c.notifications.length,
    c.listenerErrors.length,
    "one notification per host listener",
  );
  for (const [i, n] of c.notifications.entries()) {
    equal(n.i, i, "notification order");
    equal(n.value, c.s.current, "notification original committed value");
  }
  check(
    originalError instanceof AggregateError,
    "original real Selection notification AggregateError",
  );
  equal(
    originalError.errors.length,
    c.listenerErrors.length,
    "real listener errors count",
  );
  originalError.errors.forEach((error, i) =>
    equal(error, c.listenerErrors[i], "original listener throw identity"),
  );
  equal(c.n.disposed, false, "borrowed navigation alive");
  equal(c.s.disposed, false, "borrowed Selection alive");
}
export async function modelControl(classes, listeners) {
  const c = await ready(classes, { listeners });
  try {
    const action = c.n.createCandidateAction(c.page, 0);
    let error,
      didThrow = false;
    try {
      c.n.confirmCandidate(action, c.s);
    } catch (e) {
      error = e;
      didThrow = true;
    }
    check(didThrow, "actual post-commit synchronous throw");
    committed(c, error);
    equal(c.sent.length, c.sentBefore, "no confirmation wire query");
    return {
      id: "B42-real-Selection-" + listeners + "-listener",
      pass: true,
      candidateUI: false,
      notifications: c.notifications.length,
    };
  } finally {
    equal((await c.close()).length, 0, "all owned model resources released");
  }
}

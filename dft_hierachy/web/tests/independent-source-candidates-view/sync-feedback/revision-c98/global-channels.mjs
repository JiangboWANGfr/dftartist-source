// Native event observation only; no original Promise handlers and no Q1 proof.
function check(ok, label) {
  if (!ok) throw Error("C98 global channels: " + label);
}
const describe = (value) => ({
  name: value instanceof Error ? value.name : "non-Error",
  message: value instanceof Error ? value.message : String(value),
});
export function classify(errors, rejections, grants) {
  // One grant is one exact event already observed at actual componentDidCatch,
  // then separately validated against the original E/X aggregate by its caller.
  const boundaryEvents = [],
    globalErrors = [];
  errors.forEach((value, index) =>
    (grants.some(
      (original) => original.index === index && original.value === value,
    )
      ? boundaryEvents
      : globalErrors
    ).push(describe(value)),
  );
  return {
    globalErrors,
    boundaryEvents,
    unhandled: rejections.map(({ reason }) => describe(reason)),
  };
}
export function quiet(result) {
  check(result.globalErrors.length === 0, "unexpected native window.error");
  check(result.unhandled.length === 0, "unexpected native rejection");
}
export function mirror(result, pageErrors) {
  quiet(result);
  const expected = result.boundaryEvents;
  check(
    pageErrors.length === expected.length,
    "pageerror count differs from exact boundary events",
  );
  expected.forEach((e, i) => {
    // Pinned Playwright 1.64.1 Chromium exceptionToError/splitErrorMessage:
    // an inherited Error name with an empty message has no colon in CDP's
    // first description line, so it becomes {name:"", message: originalName}.
    // Apply ONLY after native original-identity classification, with no event
    // count/type blanket waiver. This is transport formatting, not the oracle.
    const projected = e.message === "" ? { name: "", message: e.name } : e;
    check(
      pageErrors[i].name === projected.name,
      "pageerror original name/order",
    );
    check(
      pageErrors[i].message === projected.message,
      "pageerror original message/order",
    );
  });
}
export function observe(host = window) {
  const errors = [],
    rejections = [],
    captures = [],
    grants = [];
  let disposed = false;
  const onError = (event) => errors.push(event.error),
    onRejection = (event) =>
      rejections.push({ reason: event.reason, promise: event.promise });
  host.addEventListener("error", onError);
  host.addEventListener("unhandledrejection", onRejection);
  return {
    errors,
    rejections,
    captureBoundary(error) {
      captures.push({
        error,
        events: errors
          .map((value, index) => ({ value, index }))
          .filter((e) => e.value === error),
      });
    },
    allowBoundary(error) {
      const actual = captures.filter((c) => c.error === error);
      check(
        actual.length > 0,
        "permission requires actual componentDidCatch snapshot",
      );
      for (const c of actual) grants.push(...c.events);
    },
    result() {
      return classify(errors, rejections, grants);
    },
    assertQuiet() {
      quiet(this.result());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      host.removeEventListener("error", onError);
      host.removeEventListener("unhandledrejection", onRejection);
    },
  };
}

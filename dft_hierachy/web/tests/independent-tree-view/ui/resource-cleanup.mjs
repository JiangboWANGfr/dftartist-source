// B test-resource ownership only; not a product lifecycle API.
export async function releaseStages(stages) {
  const attempted = [],
    errors = [];
  for (const [stage, release] of stages) {
    attempted.push(stage);
    try {
      await release();
    } catch (error) {
      errors.push({ stage, error });
    }
  }
  return { attempted, errors };
}

export function describeFailure(error) {
  const description = { type: typeof error };
  // Diagnostics must not throw or coerce an arbitrary rejection value.
  for (const key of ["message", "stack"]) {
    try {
      const value = error?.[key];
      if (typeof value === "string") description[key] = value;
    } catch {}
  }
  if (!description.message) description.message = "non-Error rejection";
  return description;
}

export async function releaseCoreSessions(entries, flush) {
  // Request every child's close before awaiting any child's exit.
  const requests = await releaseStages(
    entries.map((s) => [
      `${s.id}.close`,
      () => {
        if (!s.closeRequested) {
          s.closeRequested = true;
          s.transport.close();
        }
      },
    ]),
  );
  const releases = await Promise.all(
    entries.map((s) =>
      releaseStages([
        [`${s.id}.exited`, () => s.transport.exited],
        [
          `${s.id}.offMessage`,
          () => {
            s.offMessage();
            s.messageListenerReleased = true;
          },
        ],
        [
          `${s.id}.offClose`,
          () => {
            s.offClose();
            s.closeListenerReleased = true;
          },
        ],
        [
          `${s.id}.frames`,
          () => {
            s.closed = true;
            s.frames.length = 0;
          },
        ],
        [`${s.id}.poll`, () => flush(s)],
      ]),
    ),
  );
  return {
    attempted: [requests, ...releases].flatMap((r) => r.attempted),
    errors: [requests, ...releases].flatMap((r) => r.errors),
  };
}

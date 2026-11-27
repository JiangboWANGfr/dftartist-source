// Test-resource scope, NOT a production deadline/cancellation API.
import {
  releaseStages,
  describeFailure,
} from "../../independent-tree-view/ui/resource-cleanup.mjs";
export class ResourceFailure extends Error {
  constructor(primary, failed, cleanup) {
    super("B test scope failed");
    this.primary = primary;
    this.primaryFailed = failed;
    this.cleanup = cleanup;
  }
  get diagnostic() {
    return {
      primary: this.primaryFailed ? describeFailure(this.primary) : null,
      cleanup: this.cleanup.map((x) => ({
        stage: x.stage,
        error: describeFailure(x.error),
      })),
    };
  }
}
export async function scoped(body, stages, receipts = [], watchdog) {
  let timer,
    value,
    primary,
    failed = false;
  const deadline =
    watchdog ??
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Error("B Core scope watchdog NOT SLA")),
        20000,
      );
    });
  try {
    value = await Promise.race([Promise.resolve().then(body), deadline]);
  } catch (e) {
    primary = e;
    failed = true;
  } finally {
    clearTimeout(timer);
  }
  const release = await releaseStages(stages);
  for (const stage of release.attempted) {
    const e = release.errors.find((x) => x.stage === stage);
    receipts.push({
      step: stage,
      pass: !e,
      ...(e ? { error: describeFailure(e.error) } : {}),
    });
  }
  if (failed || release.errors.length)
    throw new ResourceFailure(primary, failed, release.errors);
  return value;
}

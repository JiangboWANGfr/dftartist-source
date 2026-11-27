import { equal } from "../pagination/public-model.mjs";
import { bindings } from "../actions/assertions.mjs";
export { bindings };
export function quiet(records, label = "commit stack") {
  equal(records.length, 0, label + " has zero observed public operations");
}
export function onlyHost(records, host = []) {
  const unexpected = records.filter(
    (r) => r.name !== "createCandidateAction" && !host.includes(r),
  );
  equal(unexpected.length, 0, "no additional public command");
}

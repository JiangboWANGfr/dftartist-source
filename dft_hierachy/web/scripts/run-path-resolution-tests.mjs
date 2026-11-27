// Run B68's combined model/view unit without adapting its frozen expectations.
import { runViewContractTests } from "./run-view-contract-tests.mjs";

const base = "web/tests/independent-path-resolution/";
runViewContractTests("PathResolution", base, {
  model: [[base + "model-run.mjs"]],
  controls: [
    [base + "core-control.mjs"],
    ["--test", "web/tests/path-resolution.test.mjs"],
  ],
});

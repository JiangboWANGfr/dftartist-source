// Run B66 frozen inputs without adapting their oracle.
import { runViewContractTests } from "./run-view-contract-tests.mjs";

runViewContractTests(
  "DefinitionInstancesView",
  "web/tests/independent-definition-instances-view/",
);

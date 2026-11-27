// Run B58 frozen inputs without adapting their oracle.
import { runViewContractTests } from "./run-view-contract-tests.mjs";

runViewContractTests(
  "ObjectConnectionsView",
  "web/tests/independent-connections-view/",
);

// Run B62 frozen inputs without adapting their oracle.
import { runViewContractTests } from "./run-view-contract-tests.mjs";

runViewContractTests(
  "SearchResultsView",
  "web/tests/independent-search-results-view/",
);

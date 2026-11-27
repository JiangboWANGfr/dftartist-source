// Not executable acceptance cases: the specification does not choose an answer.
export const questions = ["source", "readSource", "resolveSource"].flatMap(
  (source) =>
    ["createCandidateAction", "confirmCandidate"].map((method) => ({
      id: "B30-Q1-" + source + "-" + method,
      source,
      method,
      input:
        "Borrowed SDK public-method override invokes a new nav command during original command's SDK call",
      issue:
        "§6.13.2 synchronous input/start guard vs async child continuation: SDK callback dynamic extent is not explicitly defined as navigation reentrancy",
      alternatives: [
        "If within protected command dynamic extent: reentrant_change",
        "If async continuation outside protected extent: ordinary readiness/action checks",
      ],
      status:
        "specification-clarification-only; not planned/executed/pass/fail/skip; C/A clarification requested",
      basis: "DESIGN §6.13.2 and §6.17.2; cannot infer from A implementation",
    })),
);

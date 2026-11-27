// B52: pure locator from independently observed fixed production DOM.
// No model command, event replacement, or semantic expectation belongs here.
export function locateExpansionTarget({ row }) {
  return { target: row.locator("button.hier-hierarchy-tree__expand") };
}

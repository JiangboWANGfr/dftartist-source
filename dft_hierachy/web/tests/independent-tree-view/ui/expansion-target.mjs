// B test-side locator only. It never chooses product DOM or executes model commands.
let locate;
const preconditions = new WeakSet();
function missing(message) {
  const error = new Error("B_TEST_EXPANSION_LOCATOR_PRECONDITION: " + message);
  error.code = "B_TEST_EXPANSION_LOCATOR_PRECONDITION";
  preconditions.add(error);
  return error;
}
export function configureExpansionTarget(resolver) {
  if (typeof resolver !== "function")
    throw new TypeError(
      "B expansion adapter must export locateExpansionTarget(context)",
    );
  locate = resolver;
}
export function clearExpansionTarget() {
  locate = undefined;
}
export function isExpansionLocatorPrecondition(error) {
  return preconditions.has(error);
}
export function requireExpansionTarget() {
  if (!locate)
    throw missing(
      "configure HIER_B_EXPANSION_ADAPTER from the delivered component's observed DOM; no button shape/count is a product requirement",
    );
}
export async function clickExpansionTarget(context) {
  requireExpansionTarget();
  const choice = await locate(
    Object.freeze({
      page: context.page,
      row: context.row,
      rowId: context.rowId,
    }),
  );
  if (!choice || typeof choice.target?.count !== "function")
    throw missing("adapter must return {target: Locator, clickOptions?}");
  if ((await choice.target.count()) !== 1)
    throw missing("configured click target must resolve exactly once");
  // Generic DOM containment, including row-owned pointer regions. No tag/role/class contract.
  const ownRow = choice.target
    .locator("xpath=ancestor-or-self::*")
    .and(context.row);
  if ((await ownRow.count()) !== 1)
    throw missing("configured target must belong to its source row");
  await choice.target.click(choice.clickOptions);
}

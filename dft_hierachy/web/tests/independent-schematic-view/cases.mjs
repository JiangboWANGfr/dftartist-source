// Input, expected result and normative basis are fixed here and in executable bodies.
export const modelCases = [
  ["M01", "empty/current state same reference, frozen and no I/O", "6.30.1"],
  ["M02", "full one-to-one members/labels/identity and no semantic copies", "6.30.1"],
  ["M03", "four directions, exact independent edge-end anchors/self loops/size", "6.30.1"],
  ["M04", "point/ref/no-object/zero-width/external and exact edge bits/dedup", "6.30.2"],
  ["M05", "single shared selection replacement, origin graph and back/forward", "6.30.2"],
  ["M06", "real instances only, reject proxy/forged, ignore overridden getter", "6.30.1/.2"],
  ["M07", "invalid/unknown/extra/undefined target rejects without selection changes", "6.30.2"],
  ["M08", "single target reads, thrown cause, graph change/disposal priority", "6.30.2"],
  ["M09", "model/snapshot/disposal checks before target reads", "6.30.2"],
  [
    "M10",
    "new revision expires old target; shared owners and old projection preserved",
    "6.30.1/.2",
  ],
  ["M11", "not_selectable and original listener AggregateError, no rollback", "6.30.2"],
  [
    "M12",
    "real LayoutService accepts complete projection, preserves raw fact mapping",
    "6.30.1/6.29",
  ],
].map(([id, inputExpected, basis]) => ({ id, inputExpected, basis }));
export const uiCases = [
  ["U01", "empty/idle/no auto layout; explicit empty layout success", "6.30.3/.4"],
  ["U02", "partial/frontier/owners/raw fact/ports details, text-safe labels", "6.30.3"],
  ["U03", "individual parallel edge click exact bits and shared history", "6.30.2/.4"],
  ["U04", "exact subset highlight, no ref containment or definition match", "6.30.2"],
  ["U05", "native arrows/home/end/Enter/Space and roving focus", "6.30.4"],
  ["U06", "no-object focus/details, blank click leaves selection", "6.30.2/.4"],
  ["U07", "source revision hides old geometry; shared selection remains; re-layout", "6.30.3"],
  ["U08", "same-revision retained result pending/cancelled disables old hit; retry", "6.30.3/.4"],
  ["U09", "same-revision fresh task rejects detached old DOM event", "6.30.4"],
  ["U10", "Worker failure raw feedback once after microtask and retry recovery", "6.30.4"],
  ["U11", "unmount/StrictMode/remount borrows models; pending task continues", "6.30.4"],
  ["U12", "replace models/unmount cancels old feedback, not host task", "6.30.4"],
  ["U13", "focus removal returns only own focus; no external focus theft", "6.30.4"],
  ["U14", "invalid props before subscriptions; accepted later disposal renders disabled", "6.30.3"],
  [
    "U15",
    "custom legal geometry/anchors, actual direction and no implicit direction layout",
    "6.30.3",
  ],
  [
    "U16",
    "callback throw AggregateError keeps original errors; no unknown message reads",
    "6.30.4",
  ],
].map(([id, inputExpected, basis]) => ({ id, inputExpected, basis }));

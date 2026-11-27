// Explicit synthetic primary PointerEvent shape; no assertion of native device synthesis.
export const pointerInit = (type, pointerType = "mouse") => ({
  bubbles: true,
  cancelable: true,
  composed: true,
  pointerId: 37,
  pointerType,
  isPrimary: true,
  button: 0,
  buttons: type === "pointerdown" ? 1 : 0,
  detail: type === "click" ? 1 : 0,
});

// One legal synthetic pointer sequence; not a product event interpretation.
export const pointerInit = (type) => ({
  bubbles: true,
  pointerId: 35,
  pointerType: "mouse",
  isPrimary: true,
  button: 0,
  buttons: type === "pointerdown" ? 1 : 0,
  detail: type === "click" ? 1 : 0,
});

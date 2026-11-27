// Kill the 0×0-canvas drawImage crash AS A CLASS, not one call site at a time.
//
// The failure mode: Konva sizes its stage/buffer canvases from a container's clientWidth/Height.
// A container that is momentarily collapsed — a pane behind an inactive tab, a dock dragged over
// the whole column, a flex row mid-layout — measures 0, the canvas becomes 0×0, and the next
// `context.drawImage(thatCanvas, …)` THROWS `InvalidStateError: … width or height of 0`. The
// throw lands inside React's commit, the ErrorBoundary catches it, and the whole workspace goes
// red. It resurfaced three times from three different Stages, because every new canvas is a new
// chance to forget the clamp.
//
// Two layers, so a future Stage cannot reintroduce it:
//   1. Every measure site clamps to ≥1 (the per-Stage fix — keeps rendering correct).
//   2. THIS module: drawing FROM an empty canvas becomes a no-op instead of a throw. That is
//      semantically what the caller meant — an empty canvas has nothing on it, so painting it
//      paints nothing. The native API throwing here is the only difference, and it is never a
//      difference anyone wants at runtime.
//
// Import once at the entry point, before anything creates a canvas.

export function installSafeDrawImage(): void {
  const proto = CanvasRenderingContext2D.prototype;
  type DrawImage = typeof proto.drawImage;
  const marked = proto.drawImage as DrawImage & { __safeDrawImage?: true };
  if (marked.__safeDrawImage) return;   // idempotent — dev HMR re-runs entry modules

  const orig = proto.drawImage;
  const wrapped = function (this: CanvasRenderingContext2D, ...args: Parameters<DrawImage>) {
    const src = args[0];
    if ((typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement &&
         (src.width === 0 || src.height === 0)) ||
        (typeof OffscreenCanvas !== "undefined" && src instanceof OffscreenCanvas &&
         (src.width === 0 || src.height === 0)))
      return;   // an empty canvas paints nothing; the throw is the only thing being skipped
    return (orig as DrawImage).apply(this, args);
  } as DrawImage & { __safeDrawImage?: true };
  wrapped.__safeDrawImage = true;
  proto.drawImage = wrapped;
  // Verifiable from OUTSIDE the page's JS world (automation probes run isolated): the DOM is
  // shared between worlds, prototypes are not.
  document.documentElement.dataset.safeCanvas = "1";
}

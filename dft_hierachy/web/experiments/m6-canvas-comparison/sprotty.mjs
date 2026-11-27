import "reflect-metadata";
import { Container, ContainerModule, injectable } from "inversify";
import {
  TYPES,
  loadDefaultModules,
  configureViewerOptions,
  configureCommandStackOptions,
  configureModelElement,
  onAction,
  LocalModelSource,
  SGraphImpl,
  SNodeImpl,
  SEdgeImpl,
  MouseListener,
  KeyListener,
  svg,
  selectFeature,
  moveFeature,
  deletableFeature,
  editFeature,
  hoverFeedbackFeature,
  popupFeature,
} from "sprotty";
import { path } from "./projection.mjs";
import { start } from "./shell.mjs";
// Selection actions are translated to the shared model before any visual change.
// No SelectCommand/undo selection history or second layout engine owns state.
class PickMouse extends MouseListener {
  mouseDown(target, event) {
    if (event.button !== 0) return [];
    return action(target);
  }
}
class PickKey extends KeyListener {
  keyDown(target, event) {
    if (event.key !== "Enter" && event.key !== " ") return [];
    event.preventDefault();
    const id = event.target.closest?.("[data-hit]")?.dataset.hit;
    return id ? [{ kind: "experimentPick", id }] : [];
  }
}
function action(target) {
  while (target && !target.hitId) target = target.parent;
  return target ? [{ kind: "experimentPick", id: target.hitId }] : [];
}
class GraphView {
  render(model, ctx) {
    return svg(
      "svg",
      {
        class: { canvas: true },
        width: 900,
        height: 460,
        viewBox: `-20 -20 ${model.displayWidth} ${model.displayHeight}`,
        "aria-label": "Graph experiment",
      },
      ctx.renderChildren(model),
    );
  }
}
const hit = (n) => ({
  "data-hit": n.hitId,
  "data-label": n.label,
  "data-selected": String(n.selected),
  tabindex: 0,
  role: "button",
  "aria-label": n.label,
  "aria-pressed": String(n.selected),
});
class NodeView {
  render(n) {
    return svg(
      "g",
      { ...hit(n), class: { node: true } },
      svg("rect", { width: n.size.width, height: n.size.height, rx: 8 }),
      svg("text", { x: 12, y: 36 }, n.label),
      ...n.ports.map((p) =>
        svg("rect", {
          class: { port: true },
          "data-port": p.key,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
        }),
      ),
    );
  }
}
class EdgeView {
  render(e) {
    return svg(
      "g",
      { ...hit(e), class: { edge: true } },
      svg("path", { d: path(e.sections) }),
      svg("title", {}, e.label),
    );
  }
}
for (const Class of [PickMouse, PickKey, GraphView, NodeView, EdgeView]) injectable()(Class);
function createRenderer(host, pick) {
  const baseId = host.id + "-sprotty";
  const placeholder = document.createElement("div");
  placeholder.id = baseId;
  host.append(placeholder);
  const container = new Container();
  loadDefaultModules(container);
  container.load(
    new ContainerModule((bind, unbind, isBound, rebind) => {
      const context = { bind, unbind, isBound, rebind };
      bind(TYPES.ModelSource).to(LocalModelSource).inSingletonScope();
      bind(TYPES.MouseListener).to(PickMouse);
      bind(TYPES.KeyListener).to(PickKey);
      onAction(context, "experimentPick", (a) => pick(a.id));
      configureModelElement(context, "graph", SGraphImpl, GraphView);
      const disable = [
        selectFeature,
        moveFeature,
        deletableFeature,
        editFeature,
        hoverFeedbackFeature,
        popupFeature,
      ];
      configureModelElement(context, "node:fact", SNodeImpl, NodeView, { disable });
      configureModelElement(context, "edge:fact", SEdgeImpl, EdgeView, { disable });
      configureViewerOptions(context, {
        baseDiv: baseId,
        hiddenDiv: baseId + "-hidden",
        popupDiv: baseId + "-popup",
        needsClientLayout: false,
        needsServerLayout: false,
      });
      configureCommandStackOptions(context, { defaultDuration: 0, undoHistoryLimit: 0 });
    }),
  );
  let source = container.get(TYPES.ModelSource);
  return {
    async render(display) {
      await source.setModel({
        type: "graph",
        id: "root",
        zoom: 1,
        scroll: { x: 0, y: 0 },
        displayWidth: display.width,
        displayHeight: display.height,
        children: [
          ...display.edges.map((e) => ({
            ...e,
            type: "edge:fact",
            hitId: e.id,
            sourceId: e.from,
            targetId: e.to,
          })),
          ...display.nodes.map((n) => ({
            ...n,
            type: "node:fact",
            hitId: n.id,
            position: { x: n.x, y: n.y },
            size: { width: n.width, height: n.height },
          })),
        ],
      });
    },
    async dispose() {
      await source.setModel({
        type: "graph",
        id: "root",
        zoom: 1,
        scroll: { x: 0, y: 0 },
        displayWidth: 900,
        displayHeight: 460,
        children: [],
      });
      // setModel resolves before the framework canvas-bounds animation frame.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      source = null;
      container.unbindAll();
      host.replaceChildren();
      document.getElementById(baseId + "-hidden")?.remove();
      document.getElementById(baseId + "-popup")?.remove();
    },
  };
}
start("Sprotty", createRenderer);

import { createController } from "./controller.mjs";
export async function start(name, createRenderer) {
  const host = document.getElementById("canvas"),
    status = document.getElementById("status"),
    inspector = document.getElementById("inspector");
  document.getElementById("route").textContent = name;
  const errors = [],
    cycles = [];
  let controller,
    renderer,
    busy = false;
  const started = performance.now();
  async function mount() {
    renderer = createRenderer(host, (id) => controller?.pick(id));
    controller = await createController(async (display) => {
      host.dataset.interactive = String(display.interactive);
      host.setAttribute("aria-busy", String(!display.interactive));
      await renderer.render(display);
      if (controller) update();
    });
    await controller.settle();
    update();
  }
  function update() {
    const s = controller.read();
    status.textContent = `${s.layout.status} · graph r${s.graph.revision} · ${s.graph.nodes.length} nodes / ${s.graph.edges.length} edges`;
    inspector.textContent = JSON.stringify({ selection: s.selection, hit: s.lastHit }, null, 2);
  }
  async function run(method, ...args) {
    busy = true;
    try {
      const result = await controller[method](...args);
      await controller.settle();
      update();
      return result;
    } finally {
      busy = false;
    }
  }
  document.getElementById("actions").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action || busy) return;
    const [method, arg] = action.split(":");
    run(method, ...(arg ? [arg] : [])).catch((e) => {
      errors.push(String(e));
      status.textContent = String(e);
    });
  });
  host.addEventListener("click", () => {
    queueMicrotask(update);
  });
  host.addEventListener("keydown", () => {
    queueMicrotask(update);
  });
  window.EXPERIMENT = {
    run,
    read: () => ({ ...controller.read(), errors, cycles, busy }),
    async remount() {
      await controller.dispose();
      await renderer.dispose();
      cycles.push(controller.read());
      await mount();
    },
    async close() {
      const pending = await controller.disposePending();
      await renderer.dispose();
      const state = controller.read();
      cycles.push(state);
      return { pending, state };
    },
    ready: false,
  };
  try {
    await mount();
    window.EXPERIMENT.openMs = performance.now() - started;
    window.EXPERIMENT.ready = true;
  } catch (e) {
    errors.push(String(e));
    status.textContent = String(e);
    console.error(e);
  }
}

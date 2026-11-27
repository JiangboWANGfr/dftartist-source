import { test } from "node:test"; import assert from "node:assert/strict";
import { useStore } from "../../src/hierarchy/store.ts";

test("selecting an instance opens & activates a ports tab (no daemon needed)", () => {
  useStore.getState().reset();
  useStore.getState().selectInstance({ nodeId: "soc.u_cpu", defId: "cpu|x" });
  const s = useStore.getState();
  const tab = s.tabs.find((t) => t.kind === "ports" && t.nodeId === "soc.u_cpu");
  assert.ok(tab, "ports tab created");
  assert.equal(s.activeTabId, tab!.id);
});

test("re-selecting the same instance dedupes (activates the existing tab)", () => {
  useStore.getState().reset();
  useStore.getState().selectInstance({ nodeId: "soc.u_cpu", defId: "cpu|x" });
  useStore.getState().selectInstance({ nodeId: "soc.u_cpu", defId: "cpu|x" });
  const ports = useStore.getState().tabs.filter((t) => t.kind === "ports" && t.nodeId === "soc.u_cpu");
  assert.equal(ports.length, 1, "no duplicate ports tab");
});

test("selecting two different instances yields exactly ONE ports tab showing the latest", () => {
  useStore.getState().reset();
  useStore.getState().selectInstance({ nodeId: "soc.u_cpu", defId: "cpu|x" });
  useStore.getState().selectInstance({ nodeId: "soc.u_mem", defId: "mem|x" });
  const s = useStore.getState();
  const ports = s.tabs.filter((t) => t.kind === "ports");
  assert.equal(ports.length, 1, "single ports tab");
  assert.equal(ports[0].nodeId, "soc.u_mem", "follows latest selection");
  assert.equal(s.activeTabId, ports[0].id);
});

test("loadFromReady auto-expands the displayed top one level", async () => {
  useStore.getState().reset();
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).dft = {
    design: {
      query: async (method: string, params: { nodeId: string }) => {
        assert.equal(method, "expand-children");
        assert.equal(params.nodeId, "soc");
        return {
          childInstanceIds: ["soc.u_cpu"],
          children: [{ id: "soc.u_cpu", instanceName: "u_cpu", kind: "module", definitionId: "cpu|/x.v", isLeaf: true }],
        };
      },
    },
  };
  useStore.getState().loadFromReady({
    candidateTops: [{ id: "soc", instanceName: "soc", kind: "module", definitionId: "soc|/x.v", isLeaf: false, subtreeSize: 2 }],
    defCount: 2,
  });
  await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget expand settle
  const s = useStore.getState();
  assert.equal(s.expanded["soc"], true, "top expanded by default");
  assert.deepEqual(s.instances["soc"].childInstanceIds, ["soc.u_cpu"], "first level loaded");
});

// Pre-seed instances + schematics so openSchematic skips the daemon getPorts call (D12).
function seedSchematics() {
  useStore.getState().reset();
  useStore.setState({
    instances: {
      "soc.u_cpu": { instanceName: "u_cpu" } as never,
      "soc.u_mem": { instanceName: "u_mem" } as never,
    },
    schematics: { "soc.u_cpu": {} as never, "soc.u_mem": {} as never },
  });
}

test("Show on Schematic default-reuses ONE tab; a different instance replaces its content", async () => {
  seedSchematics();
  await useStore.getState().openSchematic("soc.u_cpu");
  await useStore.getState().openSchematic("soc.u_mem");
  const s = useStore.getState();
  const sch = s.tabs.filter((t) => t.kind === "schematic");
  assert.equal(sch.length, 1, "single reuse schematic tab");
  assert.equal(sch[0].seedNodeId, "soc.u_mem", "content follows the latest selection");
  assert.equal(sch[0].id, "sch:__single");
  assert.equal(s.activeTabId, "sch:__single");
});

test("Show on Schematic in New Tab opens a dedicated tab coexisting with the reuse tab", async () => {
  seedSchematics();
  await useStore.getState().openSchematic("soc.u_cpu");             // reuse tab (u_cpu)
  await useStore.getState().openSchematic("soc.u_mem", { newTab: true }); // dedicated tab (u_mem)
  const s = useStore.getState();
  const sch = s.tabs.filter((t) => t.kind === "schematic");
  assert.equal(sch.length, 2, "reuse tab + new tab coexist");
  const ids = sch.map((t) => t.id).sort();
  assert.deepEqual(ids, ["sch:__single", "sch:soc.u_mem"]);
  assert.equal(s.activeTabId, "sch:soc.u_mem", "new tab becomes active");
});

test("openPadTab opens & dedupes the singleton pad tab (no lib -> no fetch)", async () => {
  useStore.getState().reset();
  const { useDesign } = await import("../../src/store/design.ts");
  useDesign.setState({ filelist: "/tmp/x.f" }); // filelist IS present; only padLib is null
  let tableCalled = false;
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).dft = {
    pad: {
      table: async () => { tableCalled = true; return { pads: [], ssn: { inWidth: 0, outWidth: 0 }, warnings: [] }; },
    },
  };
  useStore.setState({ padLib: null }); // ensure no fetch path
  await useStore.getState().openPadTab();
  await useStore.getState().openPadTab();
  const s = useStore.getState();
  const pads = s.tabs.filter((t) => t.kind === "pad");
  assert.equal(pads.length, 1, "single pad tab");
  assert.equal(s.activeTabId, "pad");
  assert.equal(tableCalled, false, "no lib -> pad.table must not be called even with a filelist present");
  useDesign.setState({ filelist: null });
});

test("refreshPadTable tolerates a corrupt pad_cfg.json (keeps fresh table, warns instead of failing)", async () => {
  useStore.getState().reset();
  const { useDesign } = await import("../../src/store/design.ts");
  useDesign.setState({ filelist: "/tmp/x.f" });
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).dft = {
    pad: {
      table: async () => ({
        pads: [{
          path: "t.a", gpio: "G0", cell: "iopad", dir: "inout", padNet: "", coreInNet: "",
          coreOutNet: "", autoEnableNet: "oe", bscanEn: false, reuse: "", func: "", enable: "oe",
        }],
        ssn: { inWidth: 0, outWidth: 0 },
        warnings: [],
      }),
      readCfg: async () => "not json{{{",
    },
  };
  useStore.setState({ padLib: "/tmp/lib.v" });
  await useStore.getState().refreshPadTable();
  const s = useStore.getState();
  assert.equal(s.padRows.length, 1, "fresh table rows kept despite corrupt cfg");
  assert.ok(s.padWarnings.some((w) => w.includes("Failed to parse")), "warns about the corrupt cfg");
  assert.equal(s.padError, null, "does not surface as a hard error");
  useDesign.setState({ filelist: null });
});

test("patchPadRows debounce-saves overlay via writeCfg (300ms)", async () => {
  useStore.getState().reset();
  const { useDesign } = await import("../../src/store/design.ts");
  useDesign.setState({ filelist: "/tmp/x.f" });
  let written: string | null = null;
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).dft = { pad: { writeCfg: async (_f: string, json: string) => { written = json; return "/tmp/pad_cfg.json"; } } };
  useStore.setState({
    padRows: [{
      path: "t.a", gpio: "G0", cell: "iopad", dir: "inout", padNet: "", coreInNet: "",
      coreOutNet: "", autoEnableNet: "oe", bscanEn: false, reuse: "", func: "", enable: "oe",
    }],
  });
  useStore.getState().patchPadRows(["t.a"], { reuse: "in" });
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(written, "writeCfg called after debounce");
  assert.match(written!, /"reuse": "in"/);
  assert.equal(useStore.getState().padSaveState, "saved");
  useDesign.setState({ filelist: null });
});

test("reset() cancels a pending autosave (no stale write after design switch)", async () => {
  useStore.getState().reset();
  const { useDesign } = await import("../../src/store/design.ts");
  useDesign.setState({ filelist: "/tmp/x.f" });
  let writes = 0;
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).dft = { pad: { writeCfg: async () => { writes++; return "/tmp/pad_cfg.json"; } } };
  useStore.setState({
    padRows: [{
      path: "t.a", gpio: "G0", cell: "iopad", dir: "inout", padNet: "", coreInNet: "",
      coreOutNet: "", autoEnableNet: "oe", bscanEn: false, reuse: "", func: "", enable: "oe",
    }],
  });
  useStore.getState().patchPadRows(["t.a"], { reuse: "in" });  // arms the 300ms timer
  useStore.getState().reset();                                  // design switch
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(writes, 0, "no write after reset");
  useDesign.setState({ filelist: null });
});

test("reset() re-reads padLib from localStorage (no stale snapshot)", async () => {
  const ls = {
    store: {} as Record<string, string>,
    getItem(k: string) { return this.store[k] ?? null; },
    setItem(k: string, v: string) { this.store[k] = v; },
    removeItem(k: string) { delete this.store[k]; },
  };
  (globalThis as any).localStorage = ls;
  (globalThis as any).window = (globalThis as any).window ?? {};
  (window as any).dft = { pad: {} }; // setPadLib calls refreshPadTable which early-returns (no filelist)
  const { useDesign } = await import("../../src/store/design.ts");
  useDesign.setState({ filelist: null });
  await useStore.getState().setPadLib("/libs/new.tcelllib");
  useStore.getState().reset();
  assert.equal(useStore.getState().padLib, "/libs/new.tcelllib");
  delete (globalThis as any).localStorage;
});

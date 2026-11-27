// genconn data-source 引出连线 端到端冒烟（Track 1 S2）：证明在运行的应用里，从一个 data-source
// 接口引线穿过另一个 harden → 自动生成 secondary(源侧)/client(目标侧) 接口 + 一条 manual 连接 + BusWire。
// 稳定性策略（同 specgen/dfx 探针）：Konva 引脚拖拽在 playwright 里不稳，故用 __gcStore 直驱
// （setState 拉线草稿 + commitWire 走真 addWire 引擎），断言 doc 结果。无需原生二进制。

import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";

// top 含两个相邻 harden：A 的 def 有一个 DS SSN client 接口；B 空白。
const SEED = {
  schemaVersion: 1,
  library: { defs: [
    { id: "top", designName: "top", designLevel: "chip", designType: "hierarchical", interfaces: [], connections: [],
      childInstances: [
        { id: "iA", instanceName: "A_i1", hardenId: "defA", position: { x: 80, y: 100 } },
        { id: "iB", instanceName: "B_i1", hardenId: "defB", position: { x: 320, y: 100 } },
      ] },
    { id: "defA", designName: "A", designLevel: "sub_block", designType: "tiling", childInstances: [], connections: [],
      interfaces: [{ id: "dsif", busType: "SSN", role: "client", busWidth: 4, isDataSource: true, edge: { side: "right", offset: 0.5 } }] },
    { id: "defB", designName: "B", designLevel: "sub_block", designType: "tiling", interfaces: [], childInstances: [], connections: [] },
  ] },
  ui: { openDefId: "top", rootDefId: "top" },
  ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
};

test("genconn data-source wire auto-generates secondary/client interfaces + manual connection", async () => {
  test.setTimeout(60_000);
  const { app, page } = await launchApp();
  try {
    await page.evaluate((d) => { (window as any).__gcStore.getState().openText(d); }, JSON.stringify(SEED));
    await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
    await page.click('[data-tab="genconn"]');
    await expect(page.locator("#ws-genconn")).toBeVisible({ timeout: 10_000 });

    // 从 A 的 DS 接口拉线穿过 B（真 addWire 引擎）。
    const res = await page.evaluate(() => {
      const s = (window as any).__gcStore;
      s.setState({ wire: { sourceInstId: "iA", sourceIfId: "dsif", points: [{ x: 150, y: 120 }] } });
      s.getState().commitWire("iB", "", { x: 360, y: 120 });
      const doc = s.getState().doc;
      const top = doc.library.defs.find((d: any) => d.id === "top");
      const defA = doc.library.defs.find((d: any) => d.id === "defA");
      const defB = doc.library.defs.find((d: any) => d.id === "defB");
      return {
        draftCleared: s.getState().wire === null,
        conns: top.connections.map((c: any) => ({ sec: c.secondaryInstanceId, cli: c.clientInstanceId, manual: !!c.manual })),
        wires: (top.wires ?? []).length,
        defARoles: defA.interfaces.map((i: any) => i.role).sort(),
        defBRoles: defB.interfaces.map((i: any) => i.role).sort(),
      };
    });

    expect(res.draftCleared).toBe(true);
    expect(res.wires).toBe(1);
    expect(res.conns).toEqual([{ sec: "iA", cli: "iB", manual: true }]);
    // A（DS 源侧）多出一个 secondary（原 DS client 保留）；B 多出一个 client。
    expect(res.defARoles).toEqual(["client", "secondary"]);
    expect(res.defBRoles).toEqual(["client"]);
  } finally {
    await app.close();
  }
});

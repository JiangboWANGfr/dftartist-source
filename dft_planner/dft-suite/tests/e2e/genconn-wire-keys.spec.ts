// 画线态键盘回归：画 DS 线时按 Backspace/Ctrl+Z 只应"退一个拐点"，
// 不得触发全局快捷键（Backspace=删除选中实例、Ctrl+Z=全局 undo 回退 doc）。
// 曾在 Linux 实测踩中：两个 window keydown 监听并发响应同一按键。

import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";

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

async function snapshot(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const s = (window as any).__gcStore.getState();
    const top = s.doc.library.defs.find((d: any) => d.id === "top");
    return {
      defCount: s.doc.library.defs.length,
      instIds: top.childInstances.map((c: any) => c.id).sort(),
      wirePoints: s.wire ? s.wire.points.length : null,
    };
  });
}

test("画线态 Backspace/Ctrl+Z 只退拐点，不删实例/不回退 doc", async () => {
  test.setTimeout(60_000);
  const { app, page } = await launchApp();
  try {
    await page.evaluate((d) => { (window as any).__gcStore.getState().openText(d); }, JSON.stringify(SEED));
    await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
    await page.click('[data-tab="genconn"]');
    await expect(page.locator("#ws-genconn")).toBeVisible({ timeout: 10_000 });

    // 选中 iA（真实场景：点了 harden 再从其 DS 接口拉线）+ 进入画线态（2 个拐点）。
    await page.evaluate(() => {
      const s = (window as any).__gcStore;
      s.setState({ selectedIds: ["iA"] });
      s.setState({ wire: { sourceInstId: "iA", sourceIfId: "dsif", points: [{ x: 150, y: 120 }, { x: 200, y: 160 }] } });
    });

    // Backspace：退一个拐点；iA 不得被删。
    await page.keyboard.press("Backspace");
    let st = await snapshot(page);
    expect(st.instIds).toEqual(["iA", "iB"]);
    expect(st.wirePoints).toBe(1);

    // 重新补一个拐点后 Ctrl+Z：退拐点；doc 不得被全局 undo 回退（defs 仍 3 个、实例仍在）。
    await page.evaluate(() => {
      const s = (window as any).__gcStore;
      s.setState({ wire: { ...s.getState().wire, points: [{ x: 150, y: 120 }, { x: 200, y: 160 }] } });
    });
    await page.keyboard.press("Control+z");
    st = await snapshot(page);
    expect(st.instIds).toEqual(["iA", "iB"]);
    expect(st.defCount).toBe(3);
    expect(st.wirePoints).toBe(1);
  } finally {
    await app.close();
  }
});

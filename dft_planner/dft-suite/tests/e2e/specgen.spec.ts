// SpecGen 端到端冒烟（M2-T7）：证明「SpecGen 工作区 → 防抖 dftSpecgen.generate → C++ specgen CLI
// → 预览渲染真 .spec」整条链在运行的应用里通。真二进制驱动（specgen 在 ../dft-core/build），无则整个
// spec skip（对齐 dfx.spec.ts 的 daemon/ctrlgen 守卫）。
//
// 稳定性策略（同 dfx/genconn 探针）：Konva 拖拽在 playwright 里不稳，故 scope 用 __gcStore 直驱种子
// （openText 一份含 inSpecgen 的 doc + openSpecgenScope），工作区切换走真 UI tab；DOM 断言只证明预览
// 真渲染了 C++ 生成的 .spec。timeout 给足：400ms 防抖 + specgen 首跑 CLI 往返。

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { launchApp } from "../helpers/electron.ts";

const BIN = path.resolve(process.cwd(), "../dft-core/build");

test.skip(!existsSync(path.join(BIN, "specgen")), "no specgen binary");

// 种子 doc：镜像 dft-core 的 specgen_basic.doc.json —— 根 def "p"（chip）含一个 SSN client 边界接口
// (busWidth 8)、一个 ScanHost（ssh_1）、两条 dftWires 成一条 datapath（接口 out → ScanHost bus_data_in；
// ScanHost bus_data_out → 接口 in）。加 inSpecgen:true 让它成为 SpecGen scope；补齐 genconn 顶层字段。
const SEED_DOC = {
  schemaVersion: 1,
  library: {
    defs: [
      {
        id: "p",
        designName: "p",
        designLevel: "chip",
        designType: "hierarchical",
        inSpecgen: true,
        interfaces: [{ id: "ext", busType: "SSN", role: "client", busWidth: 8 }],
        childInstances: [],
        connections: [],
        dftIps: [
          {
            id: "dft_cc27bef6",
            ipType: "ScanHost",
            instanceName: "ssh_1",
            position: { x: 140, y: 60 },
            config: { use_clock_shaper_cell: "on" },
          },
        ],
        dftWires: [
          {
            id: "dw_ba545d6a",
            from: { kind: "iface", instanceId: "p", interfaceId: "ext", pin: "out" },
            to: { kind: "ip", ipId: "dft_cc27bef6", port: "bus_data_in" },
          },
          {
            id: "dw_39841f92",
            from: { kind: "ip", ipId: "dft_cc27bef6", port: "bus_data_out" },
            to: { kind: "iface", instanceId: "p", interfaceId: "ext", pin: "in" },
          },
        ],
      },
    ],
  },
  ui: { openDefId: "p", rootDefId: "p" },
  ctrlIps: [],
  dfxInstances: [],
  moduleDsNext: 1,
  muxDsNext: 1,
};

// M2/T7：种一份合法 SpecGen scope → 切 SpecGen tab → 打开 dftspec 面板 → 预览真跑 C++ specgen，
// 断言输出含 `read_config_data -in_wrapper $dftspec` + `DataPath (` —— 证明 renderer→IPC→CLI→渲染整链通。
test("specgen-m2: seeded scope -> SpecGen tab -> debounced CLI preview renders real .spec", async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  try {
    // 1. 种子：__gcStore.openText 装入 doc（走 deserialize+校验，等价真加载）→ openSpecgenScope 定 scope。
    await page.evaluate((docJson) => {
      const gc = (window as any).__gcStore.getState();
      gc.openText(docJson);
      gc.openSpecgenScope("p");
    }, JSON.stringify(SEED_DOC));

    // 2. 切到 SpecGen 工作区（真 UI tab → setWorkspace("specgen")）。
    await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
    await page.click('[data-tab="specgen"]');
    await expect(page.locator("#ws-specgen .specgen")).toBeVisible({ timeout: 10_000 });

    // 3. scope 已就绪（scope 选择器出现且选中 "p"）——证明 inSpecgen 种子被工作区认到。
    await expect(page.locator(".dft-scopebar select")).toHaveValue("p", { timeout: 10_000 });

    // 4. 打开 dftspec 预览面板（真 UI 按钮 .gen-dftspec）。
    await page.locator(".dft-scopebar .gen-dftspec").click();
    await expect(page.locator(".dft-specpanel")).toBeVisible({ timeout: 10_000 });

    // 5. 断言预览渲染了 C++ specgen 的真输出（await 400ms 防抖 + CLI 往返，超时给足）。
    //    这两行只可能来自 C++ specgen（renderer 里没有硬编码），证明整链端到端。
    const preview = page.locator(".dft-specpanel .dft-preview");
    await expect(preview).toContainText("read_config_data -in_wrapper $dftspec", { timeout: 30_000 });
    await expect(preview).toContainText("DataPath (", { timeout: 30_000 });
  } finally {
    await app.close();
  }
});

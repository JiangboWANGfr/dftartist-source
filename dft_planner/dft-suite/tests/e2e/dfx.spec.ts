// DFX Ctrl 主流程 e2e 冒烟（M3 原理图中心）：真二进制驱动（hdl daemon + ctrlgen CLI 都在
// ../dft-core/build），无则整个 spec skip。统一走 hierarchy 工作区的 DFX Ctrl tab 流程 ——
// add to DFX Ctrl → 配置弹窗（seedNodeId）→ confirmCtrlIpV3（去画布化）→ 清单 → 下载。
//
// 稳定性策略（参照前面 M3 探针）：状态迁移一律 store 直驱（openDesign/setWorkspace/
// openDfxDialog），避开 DnD 与画布双击的时序抖动；DOM 断言只用于证明 UI 真渲染了（弹窗/引脚表/
// 预览/清单/下载）。DfxDialog 的引脚行状态是组件本地 state（不在 zustand），所以「勾控制」只能走
// DOM 点 radio。timeout 给足：daemon 首解析 + ctrlgen 首跑慢。

import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { launchApp } from "../helpers/electron.ts";

const BIN = path.resolve(process.cwd(), "../dft-core/build");
const FILELIST = "/Users/jiangbowang/MOI/2025/dftartist/dft_ctrl/chip_top/chip_top.f";

test.skip(
  !existsSync(path.join(BIN, "hdl")) || !existsSync(path.join(BIN, "ctrlgen")),
  "no hdl/ctrlgen binary",
);

// M3/T4：跨工作区挂载（弹窗提升到 shell/App.tsx）+ seedNodeId 新建 + confirmCtrlIpV3（去画布化）
// + 预览加宽/拖/展开 + 添加/删除目标。全程停在 hierarchy 工作区，证明弹窗跨工作区可见。
test("dfx-m3: cross-workspace dialog + seedNodeId + preview widen/expand + add/del target + V3 confirm", async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  try {
    // 1. 打开设计并停在 hierarchy 工作区（关键：弹窗必须在这里也能显示）。
    await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
    await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("hierarchy"));
    await page.waitForFunction(() => (window as any).__dftStore.getState().status === "ready", null, { timeout: 40_000 });

    // 2. store 直驱：把 PLL_1 加入 DFX Ctrl + 打开 DFX Ctrl tab（都在 hierarchy 工作区内）。
    await page.evaluate(() => {
      (window as any).__gcStore.getState().addDfxInstance("chip_top.PLL_1");
      (window as any).__hierStore.getState().openDfxCtrlTab();
    });

    // 3. 以 seedNodeId 开「新建」弹窗（等价于双击 PLL_1 块）。
    await page.evaluate(() => (window as any).__gcStore.getState().openDfxDialog({ mode: "new", seedNodeId: "chip_top.PLL_1" }));

    // 4. 断言弹窗在 hierarchy 工作区可见 + 样式生效（.dfx-box 88vh → 高度真展开，证明去 #ws-genconn 作用域后仍上样式）。
    await expect(page.locator('[data-dfx="dialog"]')).toBeVisible({ timeout: 10_000 });
    const dbox = await page.locator('.dfx-box').boundingBox();
    expect(dbox!.height, "弹窗未上样式（跨工作区作用域问题）").toBeGreaterThan(400);

    // 5. 引脚表 + enable 行（pll 有 enable 输入 / LOCKED 输出）。
    await page.waitForSelector('[data-dfx-row]', { timeout: 30_000 });
    await expect(page.locator('[data-dfx-row="chip_top.PLL_1/enable"]')).toHaveCount(1);
    await expect(page.locator('[data-dfx-row="chip_top.PLL_1/LOCKED"]')).toHaveCount(1);

    // 6. enable → 控制；LOCKED → 观测。
    await page.locator('[data-dfx-row="chip_top.PLL_1/enable"] input[value="control"]').check();
    await page.locator('[data-dfx-row="chip_top.PLL_1/LOCKED"] input[value="observe"]').check();

    // 7. 预览三件套：.tcl 含 create_instance。
    await page.locator('[data-dfx="dialog"] .dfx-ptabs button', { hasText: ".tcl" }).click();
    await expect(page.locator('[data-dfx="preview"]')).toContainText("create_instance", { timeout: 20_000 });

    // 8. 预览加宽（b 拖分隔条 → 变宽）。
    const wBefore = (await page.locator('[data-dfx="dialog"] .dfx-preview').boundingBox())!.width;
    const sb = (await page.locator('[data-dfx="splitter"]').boundingBox())!;
    await page.mouse.move(sb.x + 3, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x - 160, sb.y + sb.height / 2, { steps: 8 });
    await page.mouse.up();
    const wAfter = (await page.locator('[data-dfx="dialog"] .dfx-preview').boundingBox())!.width;
    expect(wAfter, "拖分隔条后预览应变宽").toBeGreaterThan(wBefore + 40);

    // 9. 预览展开（d 全宽 → 左表 hidden；再点还原）。
    await page.locator('[data-dfx="expand"]').click();
    await expect(page.locator('[data-dfx="dialog"] .dfx-left')).toHaveClass(/hidden/);
    await page.locator('[data-dfx="expand"]').click();
    await expect(page.locator('[data-dfx="dialog"] .dfx-left')).not.toHaveClass(/hidden/);

    // 10. +添加目标：面板首开惰性 dump 共享 daemon（genconn 层次在 hierarchy 工作区为空）→ 搜 PLL_2 → 加入。
    await page.locator('[data-dfx="add-target"]').click();
    await page.waitForSelector('[data-dfx="add-panel"] input', { timeout: 20_000 });
    await page.fill('[data-dfx="add-panel"] input', "PLL_2");
    await page.waitForSelector('[data-dfx="add-panel"] .hier-hits li', { timeout: 10_000 });
    await page.locator('[data-dfx="add-panel"] .hier-hits li').first().click();
    // 多目标 → 每个目标出分组头，各带一个 ✕（del-target）。
    await expect(page.locator('[data-dfx="del-target"]')).toHaveCount(2, { timeout: 10_000 });
    await expect(page.locator('[data-dfx-row="chip_top.PLL_2/enable"]')).toHaveCount(1);

    // 11. 分组头 ✕ 删掉 PLL_2（保留 PLL_1 的控/观）→ 回到单目标（分组头消失）。
    await page.locator('[data-dfx="del-target"]').last().click();
    await expect(page.locator('[data-dfx="del-target"]')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('[data-dfx-row^="chip_top.PLL_2/"]')).toHaveCount(0);

    // 12. 确认（走 V3 去画布化）→ 弹窗消失；doc.ctrlIps 出现一条且无 ctrlInstId。
    await page.locator('[data-dfx="confirm"]').click();
    await expect(page.locator('[data-dfx="dialog"]')).toHaveCount(0, { timeout: 10_000 });
    const res = await page.evaluate(() => {
      const ips = (window as any).__gcStore.getState().doc.ctrlIps;
      return { n: ips.length, ctrlInstId: ips[0]?.ctrlInstId ?? null };
    });
    expect(res.n, "确认后应有一条 ctrlIp").toBe(1);
    expect(res.ctrlInstId, "V3 去画布化：无 ctrlInstId").toBeNull();
  } finally {
    await app.close();
  }
});

// M3 缺陷回归：编辑一条 V3 建的 ctrlIp —— 弹窗必须从 spec.pins 重建引脚表(V3 无 targets map),
// 显示原控制/观测预置,不改直接确认 → spec.pins 往返一致(否则空表 + 覆盖成空 = 数据丢失)。
test("dfx-m3: edit a V3 ctrlIp reconstructs pin rows from spec.pins; no-op re-confirm is round-trip lossless", async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  try {
    // 1. 打开设计 → hierarchy 工作区 → 把 PLL_1 入 DFX Ctrl。
    await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
    await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("hierarchy"));
    await page.waitForFunction(() => (window as any).__dftStore.getState().status === "ready", null, { timeout: 40_000 });
    await page.evaluate(() => {
      (window as any).__gcStore.getState().addDfxInstance("chip_top.PLL_1");
      (window as any).__hierStore.getState().openDfxCtrlTab();
    });

    // 2. 新建：enable→控制、LOCKED→观测 → 确认，得到一条 V3 ctrlIp。
    await page.evaluate(() => (window as any).__gcStore.getState().openDfxDialog({ mode: "new", seedNodeId: "chip_top.PLL_1" }));
    await page.waitForSelector('[data-dfx-row="chip_top.PLL_1/enable"]', { timeout: 30_000 });
    await page.locator('[data-dfx-row="chip_top.PLL_1/enable"] input[value="control"]').check();
    await page.locator('[data-dfx-row="chip_top.PLL_1/LOCKED"] input[value="observe"]').check();
    await page.locator('[data-dfx="confirm"]').click();
    await expect(page.locator('[data-dfx="dialog"]')).toHaveCount(0, { timeout: 10_000 });

    // 3. 记录编辑前的 spec.pins（往返基准）+ 终模块名。muxName 含 mux 实例的 ds 号,
    //    confirm 每次重新取号（A6 只增不回收）→ 剥掉再比,聚焦真正的往返内容(目标/角色/缝合)。
    const stripMux = (pins: any[]) => pins.map(({ muxName, ...p }) => p);
    const before = await page.evaluate(() => {
      const spec = (window as any).__gcStore.getState().doc.ctrlIps[0].spec;
      const mod = spec.dsIndex != null ? `${spec.moduleBase}_ds${spec.dsIndex}` : spec.moduleBase;
      return { mod, pins: spec.pins };
    });
    expect(before.pins.length, "应有 enable(控) + LOCKED(观) 两条 pin").toBe(2);

    // 4. 编辑该条（等价双击 ctrl 块 / 清单 ✎）：弹窗须从 spec.pins 重建 → 引脚表非空。
    await page.evaluate((mod) => (window as any).__gcStore.getState().openDfxDialog({ mode: "edit", module: mod }), before.mod);
    await expect(page.locator('[data-dfx="dialog"]')).toBeVisible({ timeout: 10_000 });
    await page.waitForSelector('[data-dfx-row="chip_top.PLL_1/enable"]', { timeout: 30_000 });
    // 缺陷正解：引脚表非空 + 原角色预置(enable=控制 radio checked、LOCKED=观测 radio checked)。
    await expect(page.locator('[data-dfx-row="chip_top.PLL_1/enable"] input[value="control"]')).toBeChecked();
    await expect(page.locator('[data-dfx-row="chip_top.PLL_1/LOCKED"] input[value="observe"]')).toBeChecked();

    // 5. 不改任何东西直接确认 → 往返无损：spec.pins 数量/内容与编辑前一致。
    await page.locator('[data-dfx="confirm"]').click();
    await expect(page.locator('[data-dfx="dialog"]')).toHaveCount(0, { timeout: 10_000 });
    const after = await page.evaluate(() => {
      const ips = (window as any).__gcStore.getState().doc.ctrlIps;
      return { n: ips.length, pins: ips[0]?.spec.pins };
    });
    expect(after.n, "仍是一条 ctrlIp（未覆盖成空/未新增）").toBe(1);
    expect(after.pins.length, "往返一致：pin 数量不变").toBe(before.pins.length);
    expect(stripMux(after.pins), "往返一致：目标/角色/缝合与编辑前相同（muxName 除外）").toEqual(stripMux(before.pins));
  } finally {
    await app.close();
  }
});

// M3/T5：完整用户链路 —— 树右键「Add to DFX Ctrl」→ DFX Ctrl tab + 清单 → 配置 → 确认
// → ctrl/mux(spec) → 单击清单高亮 → 下载全部。真 UI 优先（右键菜单/tab/清单/下载按钮走 DOM）；
// tree 懒展开 + Konva 块双击用 store 兜底（画布无 DOM 命中点、双击坐标不稳）。
test("dfx-m3-t5: context-menu Add to DFX Ctrl -> tab list -> configure -> highlight -> generate-all", async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  try {
    // 1. 打开设计 + 停在 hierarchy 工作区。
    await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
    await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("hierarchy"));
    await page.waitForFunction(() => (window as any).__dftStore.getState().status === "ready", null, { timeout: 40_000 });
    await page.waitForFunction(() => (window as any).__hierStore.getState().rootInstanceIds.length > 0, null, { timeout: 40_000 });

    // 2. 展开根（store 兜底：懒加载 children 时序不稳）→ 找到 PLL_1 行。
    const rootId = await page.evaluate(() => (window as any).__hierStore.getState().rootInstanceIds[0]);
    await page.evaluate((rid) => (window as any).__hierStore.getState().toggleExpand(rid), rootId);
    const pllId = await page.evaluate(() => {
      const insts = (window as any).__hierStore.getState().instances;
      const hit = Object.values(insts).find((n: any) => n.instanceName === "PLL_1");
      return hit ? (hit as any).id : null;
    });
    expect(pllId, "PLL_1 未在展开后的树里找到").toBeTruthy();
    await page.waitForSelector(`[data-node="${pllId}"]`, { timeout: 30_000 });

    // 3. 右键 PLL_1 行 → 真右键菜单 → 点「Add to DFX Ctrl」（真 UI 全程）。
    await page.locator(`[data-node="${pllId}"]`).click({ button: "right" });
    await page.waitForSelector('.cmenu [data-menu="add-to-dfx"]', { timeout: 5_000 });
    await page.locator('.cmenu [data-menu="add-to-dfx"]').click();

    // 4. DFX Ctrl tab 出现（真 UI：tab 标题 + tab body），且实例入 doc.dfxInstances（证明 addToDfxCtrl 接线）。
    await expect(page.locator('.tabbar .ttitle', { hasText: "DFX Ctrl" })).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('[data-tab-kind="dfxctrl"]')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => (window as any).__gcStore.getState().doc.dfxInstances)).toContain(pllId);

    // 5. 双击 PLL_1 块 → 配置弹窗（Konva 块无 DOM 命中点、双击坐标不稳 → store 兜底 seedNodeId）。
    await page.evaluate((id) => (window as any).__gcStore.getState().openDfxDialog({ mode: "new", seedNodeId: id }), pllId);
    await expect(page.locator('[data-dfx="dialog"]')).toBeVisible({ timeout: 10_000 });
    await page.waitForSelector(`[data-dfx-row="${pllId}/enable"]`, { timeout: 30_000 });

    // 6. enable → 控制；LOCKED → 观测（真 UI radios）。
    await page.locator(`[data-dfx-row="${pllId}/enable"] input[value="control"]`).check();
    await page.locator(`[data-dfx-row="${pllId}/LOCKED"] input[value="observe"]`).check();

    // 7. 确认（真 UI）→ 弹窗消失。
    await page.locator('[data-dfx="confirm"]').click();
    await expect(page.locator('[data-dfx="dialog"]')).toHaveCount(0, { timeout: 10_000 });

    // 8. ctrl 块 + mux：spec 有 control 引脚（tab 依 doc 重建 ctrl 块/mux/连线到 PLL_1）。
    const spec = await page.evaluate(() => (window as any).__gcStore.getState().doc.ctrlIps[0]?.spec);
    expect(spec, "确认后应有一条 ctrlIp spec").toBeTruthy();
    expect(spec.pins.filter((p: any) => p.mode === "control").length, "应有控制引脚").toBeGreaterThan(0);

    // 9. 清单出现一条（真 UI：tab 侧栏）。
    await expect(page.locator('[data-tab-kind="dfxctrl"] [data-dfx-item]')).toHaveCount(1, { timeout: 10_000 });

    // 10. 单击清单项 → 高亮该组（真 UI：li 得 sel 类）。
    const item = page.locator('[data-tab-kind="dfxctrl"] [data-dfx-item]').first();
    await item.click();
    await expect(item).toHaveClass(/sel/);

    // 11. 下载全部（真 UI 点按钮）：patch 锚点 click 记录下载（避 Electron 保存框），断言每模块三件套 + 无错。
    await page.evaluate(() => {
      (window as any).__downloads = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        if (this.download) { (window as any).__downloads.push(this.download); return; }
        return orig.call(this);
      };
    });
    await page.locator('[data-tab-kind="dfxctrl"] [data-btn="gen-all"]').click();
    // gen-all 现在打开预览面板；从预览的「全部下载」触发下载
    await page.locator('[data-tab-kind="dfxctrl"] [data-btn="dfx-genall-download"]').click({ timeout: 20_000 });
    await page.waitForFunction(() => ((window as any).__downloads?.length ?? 0) >= 3, null, { timeout: 20_000 });
    await expect(page.locator('[data-tab-kind="dfxctrl"] .dfxctrl-err')).toHaveCount(0);
    const names: string[] = await page.evaluate(() => (window as any).__downloads);
    expect(names.some((n) => n.endsWith(".v")), ".v 未下载").toBe(true);
    expect(names.some((n) => n.endsWith(".icl")), ".icl 未下载").toBe(true);
    expect(names.some((n) => n.endsWith(".tcl")), ".tcl 未下载").toBe(true);
  } finally {
    await app.close();
  }
});

// M3 缺陷回归(Fix1)：多实例修改往返 —— seed PLL_1 + `+添加目标` RDS_1 都配控制/观测 → 确认。
// confirmCtrlIpV3 须把两个目标 nodeId 都登记进 dfxInstances(否则编辑反查 targetsFromSpec 命中不到
// RDS_1 的完整 nodeId → loadRows 拉端口失败 → 引脚表空/丢引脚)。再编辑：两目标引脚表都非空、角色预置;
// 空操作确认 → spec.pins 往返一致(剥 muxName)。
test("dfx-m3 fix1: multi-instance edit round-trip — confirm registers all targets into dfxInstances", async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  try {
    // 1. 打开设计 → hierarchy 工作区 → PLL_1 入 DFX Ctrl。
    await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
    await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("hierarchy"));
    await page.waitForFunction(() => (window as any).__dftStore.getState().status === "ready", null, { timeout: 40_000 });
    await page.evaluate(() => {
      (window as any).__gcStore.getState().addDfxInstance("chip_top.PLL_1");
      (window as any).__hierStore.getState().openDfxCtrlTab();
    });

    // 2. 新建弹窗(seed PLL_1)：enable→控制、LOCKED→观测。
    await page.evaluate(() => (window as any).__gcStore.getState().openDfxDialog({ mode: "new", seedNodeId: "chip_top.PLL_1" }));
    await page.waitForSelector('[data-dfx-row="chip_top.PLL_1/enable"]', { timeout: 30_000 });
    await page.locator('[data-dfx-row="chip_top.PLL_1/enable"] input[value="control"]').check();
    await page.locator('[data-dfx-row="chip_top.PLL_1/LOCKED"] input[value="observe"]').check();

    // 3. +添加目标 RDS_1（该 nodeId 从不经 dfxInstances 登记，正是缺陷来源）→ start→控制、ready→观测。
    await page.locator('[data-dfx="add-target"]').click();
    await page.waitForSelector('[data-dfx="add-panel"] input', { timeout: 20_000 });
    await page.fill('[data-dfx="add-panel"] input', "RDS_1");
    await page.waitForSelector('[data-dfx="add-panel"] .hier-hits li', { timeout: 10_000 });
    await page.locator('[data-dfx="add-panel"] .hier-hits li').first().click();
    await page.waitForSelector('[data-dfx-row="chip_top.RDS_1/start"]', { timeout: 30_000 });
    await page.locator('[data-dfx-row="chip_top.RDS_1/start"] input[value="control"]').check();
    await page.locator('[data-dfx-row="chip_top.RDS_1/ready"] input[value="observe"]').check();

    // 4. 确认 → 弹窗关。断言 dfxInstances 两个目标都在（Fix1a：confirm 登记全部目标）。
    await page.locator('[data-dfx="confirm"]').click();
    await expect(page.locator('[data-dfx="dialog"]')).toHaveCount(0, { timeout: 10_000 });
    const insts: string[] = await page.evaluate(() => (window as any).__gcStore.getState().doc.dfxInstances);
    expect(insts, "PLL_1 已在 tab").toContain("chip_top.PLL_1");
    expect(insts, "Fix1a：RDS_1 被 confirm 登记进 dfxInstances").toContain("chip_top.RDS_1");

    // 5. 记录编辑前 spec（终模块名 + pins，剥 muxName 后作往返基准）。四条 pin：PLL_1 控/观 + RDS_1 控/观。
    const stripMux = (pins: any[]) => pins.map(({ muxName, ...p }) => p);
    const before = await page.evaluate(() => {
      const spec = (window as any).__gcStore.getState().doc.ctrlIps[0].spec;
      const mod = spec.dsIndex != null ? `${spec.moduleBase}_ds${spec.dsIndex}` : spec.moduleBase;
      return { mod, pins: spec.pins };
    });
    expect(before.pins.length, "PLL_1 控/观 + RDS_1 控/观 = 4 pin").toBe(4);

    // 6. 编辑该条：弹窗须从 spec.pins 重建两个目标（RDS_1 靠 dfxInstances 反查到完整 nodeId）→ 两表都非空、角色预置。
    await page.evaluate((mod) => (window as any).__gcStore.getState().openDfxDialog({ mode: "edit", module: mod }), before.mod);
    await expect(page.locator('[data-dfx="dialog"]')).toBeVisible({ timeout: 10_000 });
    await page.waitForSelector('[data-dfx-row="chip_top.RDS_1/start"]', { timeout: 30_000 });
    await expect(page.locator('[data-dfx-row="chip_top.PLL_1/enable"] input[value="control"]')).toBeChecked();
    await expect(page.locator('[data-dfx-row="chip_top.PLL_1/LOCKED"] input[value="observe"]')).toBeChecked();
    await expect(page.locator('[data-dfx-row="chip_top.RDS_1/start"] input[value="control"]')).toBeChecked();
    await expect(page.locator('[data-dfx-row="chip_top.RDS_1/ready"] input[value="observe"]')).toBeChecked();

    // 7. 空操作确认 → 往返无损：pin 数量/内容(目标/角色/缝合)与编辑前一致(muxName 除外)。
    await page.locator('[data-dfx="confirm"]').click();
    await expect(page.locator('[data-dfx="dialog"]')).toHaveCount(0, { timeout: 10_000 });
    const after = await page.evaluate(() => {
      const ips = (window as any).__gcStore.getState().doc.ctrlIps;
      return { n: ips.length, pins: ips[0]?.spec.pins };
    });
    expect(after.n, "仍是一条 ctrlIp").toBe(1);
    expect(after.pins.length, "往返：pin 数量不变").toBe(before.pins.length);
    expect(stripMux(after.pins), "往返：两目标的目标/角色/缝合都一致").toEqual(stripMux(before.pins));
  } finally {
    await app.close();
  }
});

// M3 缺陷回归(Fix2)：从 DFX tab 侧栏「实例」小节移除实例块 + 引用守卫。两实例列出 → 点未被引用者 ✕
// 直接移除(无 confirm)；建一条引用 PLL_1 的 ctrlIp 后点 PLL_1 ✕ → confirm(accept) → 实例移除但配置(ctrlIps)仍在。
test("dfx-m3 fix2: remove instance block from DFX tab sidebar with reference guard", async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp({ DFT_CORE_BIN_DIR: BIN });
  try {
    // appConfirm 走主进程原生对话框，Playwright page.on("dialog") 驱动不到 → 用 e2e 钩子记录并接受。
    await page.evaluate(() => { (window as any).__e2eConfirmLog = []; (window as any).__e2eConfirm = (m: string) => { (window as any).__e2eConfirmLog.push(m); return true; }; });
    // 1. 打开设计 → hierarchy 工作区 → 加两个实例 + 开 DFX Ctrl tab。
    await page.evaluate((fl) => (window as any).__dftStore.getState().openDesign({ filelist: fl }), FILELIST);
    await page.evaluate(() => (window as any).__dftStore.getState().setWorkspace("hierarchy"));
    await page.waitForFunction(() => (window as any).__dftStore.getState().status === "ready", null, { timeout: 40_000 });
    await page.evaluate(() => {
      const gc = (window as any).__gcStore.getState();
      gc.addDfxInstance("chip_top.PLL_1");
      gc.addDfxInstance("chip_top.RDS_1");
      (window as any).__hierStore.getState().openDfxCtrlTab();
    });
    await expect(page.locator('[data-tab-kind="dfxctrl"]')).toBeVisible({ timeout: 10_000 });

    // 2. 侧栏「实例」小节列出两个。
    await expect(page.locator('[data-tab-kind="dfxctrl"] [data-dfx-inst]')).toHaveCount(2, { timeout: 10_000 });

    // 3. 点未被引用实例(RDS_1)的 ✕ → 无 confirm(dialogs 不增)、直接移除 → 少一个、doc 也少一个。
    await page.locator('[data-dfx-inst-del="chip_top.RDS_1"]').click();
    await expect(page.locator('[data-tab-kind="dfxctrl"] [data-dfx-inst]')).toHaveCount(1, { timeout: 10_000 });
    expect(await page.evaluate(() => (window as any).__e2eConfirmLog.length), "未被引用 → 直接移除，不弹 confirm").toBe(0);
    expect(await page.evaluate(() => (window as any).__gcStore.getState().doc.dfxInstances))
      .toEqual(["chip_top.PLL_1"]);

    // 4. 建一条引用 PLL_1 的 ctrlIp（store 直驱 confirmCtrlIpV3，纯函数不碰 daemon）。
    await page.evaluate(() => (window as any).__gcStore.getState().confirmCtrlIpV3({
      editModule: null, moduleBase: "pll_ctrl",
      rows: [{ pin: "enable", dir: "in", width: 1, nodeId: "chip_top.PLL_1", instName: "PLL_1", role: "control", stitch: ["mux"] }],
    }));
    await expect(page.locator('[data-tab-kind="dfxctrl"] [data-dfx-item]')).toHaveCount(1, { timeout: 10_000 });

    // 5. 点被引用实例(PLL_1)的 ✕ → confirm(accept) → 实例移除，但配置 ctrlIps 保留。
    await page.locator('[data-dfx-inst-del="chip_top.PLL_1"]').click();
    await expect(page.locator('[data-tab-kind="dfxctrl"] [data-dfx-inst]')).toHaveCount(0, { timeout: 10_000 });
    const confirms: string[] = await page.evaluate(() => (window as any).__e2eConfirmLog);
    expect(confirms.length, "被引用 → 弹一次 confirm").toBe(1);
    expect(confirms[0], "confirm 文案含模块名").toContain("pll_ctrl");
    const st = await page.evaluate(() => {
      const doc = (window as any).__gcStore.getState().doc;
      return { insts: doc.dfxInstances.length, ips: doc.ctrlIps.length };
    });
    expect(st.insts, "实例块已移除").toBe(0);
    expect(st.ips, "配置(ctrlIps)未删").toBe(1);
  } finally {
    await app.close();
  }
});

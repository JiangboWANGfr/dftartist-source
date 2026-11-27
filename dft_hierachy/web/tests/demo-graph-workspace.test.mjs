import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { _electron } from "playwright";

const web = fileURLToPath(new URL("../", import.meta.url));
const consumer = process.env.HIER_A_DEMO_DELIVERY;
const app = consumer ? path.join(consumer, "app") : path.join(web, "apps/demo");
const binary = createRequire(path.join(consumer ?? web, "package.json"))("electron");
const design = fileURLToPath(new URL("./demo-graph/design.sv", import.meta.url));

test(
  "A: graph Escape respects composition and child consumption",
  { timeout: 30_000 },
  async () => {
    assert(process.env.HIER_BIN, "explicit real Core");
    const electron = await _electron.launch({
      executablePath: binary,
      args: [app],
      env: process.env,
    });
    try {
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      const page = await electron.firstWindow();
      page.setDefaultTimeout(7000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      const controls = page.getByRole("button", { name: "高级控制", exact: true });
      await controls.click();
      await page.locator("summary").getByText("追踪选项", { exact: true }).click();
      const width = page.getByRole("spinbutton", { name: "追踪 width", exact: true });
      await width.fill("3");
      const original = await width.elementHandle();
      for (const mode of ["composition", "child-consumed"]) {
        await width.focus();
        // Browser event boundary, not a claim of operating a physical OS input method.
        await width.evaluate((element, mode) => {
          const event = new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
            isComposing: mode === "composition",
          });
          if (mode === "child-consumed") event.preventDefault();
          element.dispatchEvent(event);
        }, mode);
        assert.equal(await controls.getAttribute("aria-expanded"), "true", mode);
        assert.equal(await width.isVisible(), true);
        assert.equal(await width.inputValue(), "3");
        assert.equal(await original.evaluate((node) => node === document.activeElement), true);
      }
      await page.keyboard.press("Escape");
      assert.equal(await controls.getAttribute("aria-expanded"), "false");
      assert.equal(await controls.evaluate((node) => node === document.activeElement), true);
      await controls.click();
      assert.equal(await width.inputValue(), "3");
      assert.equal(await width.evaluate((node, old) => node === old, original), true);
      assert.equal(await page.locator('[role="treeitem"][aria-selected="true"]').count(), 0);
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.getByText("设计已关闭", { exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await electron.close();
    }
  },
);

test(
  "A: workspace panels preserve source, graph and selection across view changes",
  { timeout: 30_000 },
  async () => {
    assert(process.env.HIER_BIN, "explicit real Core");
    const electron = await _electron.launch({
      executablePath: binary,
      args: [app],
      env: process.env,
    });
    try {
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      const page = await electron.firstWindow();
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1440, 968),
      );
      page.setDefaultTimeout(7000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      const candidates = page.getByRole("region", { name: "源码候选", exact: true });
      assert.equal(
        await candidates.isVisible(),
        false,
        "empty candidate panel does not consume source area",
      );
      assert.equal(await page.getByRole("tabpanel").count(), 1, "one inspector panel is visible");
      await page.getByRole("treeitem").first().click();
      await page
        .getByRole("region", { name: "实例属性", exact: true })
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "y", exact: true }) })
        .getByRole("button", { name: "选择端口", exact: true })
        .click();
      const source = page.getByRole("region", { name: "设计源码", exact: true });
      await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
      const text = await source.locator("code").textContent();
      const tabs = page.getByRole("tablist", { name: "对象与查询详情" });
      await tabs.getByRole("tab", { name: "实例属性", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await tabs.getByRole("tab", { name: "对象连接" }).getAttribute("aria-selected"),
        "true",
      );
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), "对象连接");
      const connections = page.getByRole("region", { name: "对象连接", exact: true });
      const connectionSide = page.getByRole("combobox", { name: "连接侧", exact: true });
      const summary = (name) =>
        connections
          .locator("dt")
          .filter({ hasText: new RegExp(`^${name}$`) })
          .locator("+ dd");
      await connections
        .getByText("bad_request: ports require inside or outside side", { exact: true })
        .waitFor();
      const portRef = await summary("查询对象").textContent();
      const originalSource = await source.locator("code").elementHandle();
      const selectedPort = page
        .getByRole("region", { name: "实例属性", exact: true })
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "y", exact: true }) });
      async function screenshot(name) {
        if (process.env.HIER_A_WORKSPACE_SCREENSHOTS) {
          await page.screenshot({
            path: path.join(process.env.HIER_A_WORKSPACE_SCREENSHOTS, name),
          });
        }
      }
      async function connectionSuccess(side, bits = "整个对象") {
        await connectionSide.selectOption(side);
        await connections.getByRole("button", { name: "刷新", exact: true }).waitFor();
        assert.equal(await summary("查询对象").textContent(), portRef);
        assert.equal(await summary("reach").textContent(), "local");
        assert.equal(await summary("side").textContent(), side);
        assert.equal(await summary("请求位段").textContent(), bits);
        assert.equal(await connections.getByRole("status").textContent(), "");
        assert.equal(
          await source
            .locator("code")
            .evaluate((code, original) => code === original, originalSource),
          true,
        );
        assert.equal(await source.locator("code").textContent(), text);
      }
      const notice = page.getByRole("region", { name: "最近一次操作提示", exact: true });
      const designStatus = page.getByRole("status", { name: "设计状态", exact: true });
      await notice
        .getByText("bad_request: ports require inside or outside side", { exact: true })
        .waitFor();
      assert.equal(await designStatus.getAttribute("data-phase"), "ready");
      assert.match(await designStatus.textContent(), /^已打开：/);
      await screenshot("connections-missing-side.png");
      await notice.getByRole("button", { name: "关闭操作提示", exact: true }).focus();
      await page.keyboard.press("Enter");
      assert.equal(await notice.count(), 0);
      assert.equal(await designStatus.evaluate((node) => document.activeElement === node), true);
      assert.match(
        await connections.getByRole("status").textContent(),
        /ports require inside or outside side/,
      );
      assert.equal(await summary("查询对象").textContent(), portRef);
      assert.equal(
        await source
          .locator("code")
          .evaluate((code, original) => code === original, originalSource),
        true,
      );
      await screenshot("notice-dismissed-error-retained.png");
      await connectionSuccess("inside");
      await screenshot("connections-inside.png");
      await connectionSide.selectOption("outside");
      await connections
        .getByText("bad_request: top ports have only an inside", { exact: true })
        .waitFor();
      assert.equal(await summary("side").textContent(), "outside");
      await notice
        .getByText("bad_request: top ports have only an inside", { exact: true })
        .waitFor();
      await screenshot("connections-outside.png");
      // A cancelled native picker retains both the old design and its operation notice.
      await electron.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      });
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await designStatus.getByText("已取消选择", { exact: true }).waitFor();
      assert.equal(await designStatus.getAttribute("data-phase"), "ready");
      assert.match(await notice.textContent(), /top ports have only an inside/);
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      await connectionSuccess("inside");
      assert.match(
        await notice.textContent(),
        /top ports have only an inside/,
        "a successful query does not silently resolve historical feedback",
      );
      await screenshot("notice-after-query-recovery.png");
      await notice.getByRole("button", { name: "关闭操作提示", exact: true }).click();
      assert.equal(await notice.count(), 0);
      await connectionSide.selectOption("");
      await connections
        .getByText("bad_request: ports require inside or outside side", { exact: true })
        .waitFor();
      await connectionSuccess("inside");
      await tabs.getByRole("tab", { name: "实例属性", exact: true }).click();
      assert.match(
        await selectedPort.textContent(),
        /已选中/,
        "changing the query side does not change shared selection",
      );
      await page.getByRole("treeitem").first().click();
      await tabs.getByRole("tab", { name: "对象连接", exact: true }).click();
      await connections.getByText("尚未指定连接目标", { exact: true }).waitFor();
      assert.equal(await connectionSide.isDisabled(), true);
      assert.equal(await connectionSide.inputValue(), "");
      await tabs.getByRole("tab", { name: "实例属性", exact: true }).click();
      await selectedPort.getByRole("button", { name: "选择端口", exact: true }).click();
      await tabs.getByRole("tab", { name: "对象连接", exact: true }).click();
      await connections
        .getByText("bad_request: ports require inside or outside side", { exact: true })
        .waitFor();
      assert.equal(
        await connectionSide.inputValue(),
        "",
        "new selection does not inherit the old query side",
      );
      await tabs.getByRole("tab", { name: "对象连接", exact: true }).focus();
      await page.keyboard.press("End");
      assert.equal(
        await tabs.getByRole("tab", { name: "路径结果" }).getAttribute("aria-selected"),
        "true",
      );
      await page.keyboard.press("Home");
      assert.equal(
        await tabs.getByRole("tab", { name: "实例属性" }).getAttribute("aria-selected"),
        "true",
      );
      await page.getByRole("textbox", { name: "搜索", exact: true }).fill("mid");
      await page.getByRole("button", { name: "搜索", exact: true }).click();
      await page
        .getByRole("region", { name: "搜索结果", exact: true })
        .getByRole("cell", { name: "mid", exact: true })
        .first()
        .waitFor();
      assert.equal(
        await tabs.getByRole("tab", { name: "搜索结果" }).getAttribute("aria-selected"),
        "true",
      );
      const queryToggle = page.getByRole("button", { name: "查询工具", exact: true });
      const queries = page.getByRole("region", { name: "搜索与路径查询", exact: true });
      const querySearch = page.getByRole("textbox", { name: "搜索", exact: true });
      const queryPath = page.getByRole("textbox", { name: "路径", exact: true });
      const searchNode = await querySearch.elementHandle();
      const pathText = "demo_graph_top.y ";
      await queryPath.fill(pathText);
      const sourceBeforeQueries = await source.locator("code").elementHandle();
      const selectedBeforeQueries = await page
        .locator('[role="treeitem"][aria-selected="true"]')
        .textContent();
      const columnsBeforeQueries = await page.locator(".demo-columns").boundingBox();
      await screenshot("queries-expanded-source.png");
      await queryToggle.click();
      assert.equal(await queries.isVisible(), false);
      assert.equal(await queryToggle.getAttribute("aria-expanded"), "false");
      assert.equal(await queryToggle.evaluate((node) => node === document.activeElement), true);
      await page.waitForFunction(
        (height) => document.querySelector(".demo-columns").clientHeight > height,
        columnsBeforeQueries.height,
      );
      assert.equal(
        await page.getByRole("region", { name: "搜索结果", exact: true }).isVisible(),
        true,
      );
      assert.equal(
        await notice.isVisible(),
        true,
        "collapsing query inputs does not hide operation diagnostics",
      );
      assert.equal(
        await source
          .locator("code")
          .evaluate((node, original) => node === original, sourceBeforeQueries),
        true,
      );
      assert.equal(
        await page.locator('[role="treeitem"][aria-selected="true"]').textContent(),
        selectedBeforeQueries,
      );
      await screenshot("queries-collapsed-source.png");
      await page.keyboard.press("Space");
      assert.equal(await queries.isVisible(), true);
      assert.equal(await querySearch.evaluate((node) => node === document.activeElement), true);
      assert.equal(
        await querySearch.evaluate((node, original) => node === original, searchNode),
        true,
      );
      assert.equal(await querySearch.inputValue(), "mid");
      assert.equal(
        await queryPath.inputValue(),
        pathText,
        "collapsing preserves original path including trailing space",
      );
      await queryPath.focus();
      await page.keyboard.press("Escape");
      assert.equal(await queries.isVisible(), false);
      assert.equal(await queryToggle.evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press("Enter");
      assert.equal(await querySearch.inputValue(), "mid");
      assert.equal(await queryPath.inputValue(), pathText);
      await tabs.getByRole("tab", { name: "实例属性" }).click();

      await source.locator("pre").focus();
      await source.locator("code").evaluate((code) => {
        window.aWorkspaceSource = code;
        const offset = code.textContent.indexOf("mid;");
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        let at = 0,
          node;
        while ((node = walker.nextNode())) {
          if (at + node.textContent.length > offset) {
            getSelection().setBaseAndExtent(node, offset - at, node, offset - at);
            return;
          }
          at += node.textContent.length;
        }
        throw Error("real source token absent");
      });
      await page.keyboard.press("Alt+Enter");
      await candidates.locator("ul > li > button").first().waitFor();
      const candidateText = await candidates.locator("ul").textContent();
      await page.getByRole("button", { name: "源码候选 收起", exact: true }).click();
      assert.equal(await candidates.isVisible(), false);
      await source.locator("pre").focus();
      await page.keyboard.press("Alt+Enter");
      await candidates.locator("ul > li > button").first().waitFor();
      assert.equal(
        await candidates.isVisible(),
        true,
        "a repeated explicit source query reopens candidates",
      );
      await page.getByRole("button", { name: "源码候选 收起", exact: true }).click();
      await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
      assert.equal(await candidates.locator("ul").textContent(), candidateText);
      const candidateDivider = page.getByRole("separator", { name: "源码候选高度" });
      const candidateSize = () => candidateDivider.getAttribute("aria-valuenow").then(Number);
      const defaultCandidateSize = await candidateSize();
      assert.equal(await candidateDivider.getAttribute("aria-orientation"), "horizontal");
      assert.equal(
        defaultCandidateSize,
        Number(await candidateDivider.getAttribute("aria-valuemin")),
      );
      const candidateSource = await source.locator("code").elementHandle();
      const codeHeight = (await source.locator("pre").boundingBox()).height;
      const listHeight = (await candidates.locator("ul").boundingBox()).height;
      async function dragCandidates(delta, cancel = false) {
        const box = await candidateDivider.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + delta, { steps: 4 });
        if (cancel) await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      await screenshot("candidate-default.png");
      await dragCandidates(-80);
      assert.equal(await candidateSize(), defaultCandidateSize + 80);
      assert((await source.locator("pre").boundingBox()).height < codeHeight);
      assert((await candidates.locator("ul").boundingBox()).height > listHeight);
      assert.equal(await candidates.locator("ul").textContent(), candidateText);
      assert.equal(
        await source
          .locator("code")
          .evaluate((node, original) => node === original, candidateSource),
        true,
      );
      await candidateDivider.focus();
      await page.keyboard.press("ArrowUp");
      assert.equal(await candidateSize(), defaultCandidateSize + 100);
      await page.keyboard.press("ArrowDown");
      assert.equal(await candidateSize(), defaultCandidateSize + 80);
      await page.keyboard.press("End");
      assert.equal(
        await candidateSize(),
        Number(await candidateDivider.getAttribute("aria-valuemax")),
      );
      await page.keyboard.press("Home");
      assert.equal(await candidateSize(), defaultCandidateSize);
      await dragCandidates(-80);
      await dragCandidates(30, true);
      assert.equal(await candidateSize(), defaultCandidateSize + 80, "Escape restores height");
      await candidateDivider.dblclick();
      assert.equal(await candidateSize(), defaultCandidateSize);
      await dragCandidates(-60);
      await screenshot("candidate-expanded.png");
      await page.getByRole("button", { name: "源码候选 收起", exact: true }).click();
      assert.equal(await candidateDivider.isVisible(), false);
      await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
      assert.equal(await candidateSize(), defaultCandidateSize + 60);
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(960, 640),
      );
      await page.waitForFunction(
        (size) =>
          Number(
            document.querySelector('[aria-label="源码候选高度"]').getAttribute("aria-valuenow"),
          ) < size,
        defaultCandidateSize + 60,
      );
      assert.equal(await candidateSize(), defaultCandidateSize);
      await screenshot("candidate-constrained-small.png");
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1440, 968),
      );
      await page.waitForFunction(
        (size) =>
          Number(
            document.querySelector('[aria-label="源码候选高度"]').getAttribute("aria-valuenow"),
          ) === size,
        defaultCandidateSize + 60,
      );
      assert.equal(await source.locator("code").textContent(), text);
      assert.equal(await candidates.locator("ul").textContent(), candidateText);
      const beforeSelection = await page
        .locator('[role="treeitem"][aria-selected="true"]')
        .textContent();
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      assert.equal(await source.isVisible(), false, "opening graph gives it the main work area");
      assert.equal(
        await page.getByRole("spinbutton", { name: "追踪 width", exact: true }).isVisible(),
        false,
      );
      assert.equal(
        await page.getByRole("button", { name: "添加外部示例", exact: true }).isVisible(),
        false,
      );
      await page.getByRole("combobox", { name: "追踪侧", exact: true }).selectOption("inside");
      const options = page
        .locator("details")
        .filter({ has: page.locator("summary").getByText("追踪选项", { exact: true }) });
      const width = page.getByRole("spinbutton", { name: "追踪 width", exact: true });
      const controls = page.getByRole("button", { name: "高级控制", exact: true });
      const info = page.getByRole("button", { name: "来源与详情", exact: true });
      assert.equal(await page.locator(".hier-schematic-view__information").isVisible(), false);
      await controls.click();
      await options.locator("summary").click();
      await width.fill("");
      await options.locator("summary").click();
      await controls.click();
      await page.getByRole("button", { name: "追踪所选对象", exact: true }).click();
      assert.equal(
        await options.evaluate((element) => element.open),
        true,
        "invalid hidden parameters reopen before native focus/validation",
      );
      assert.equal(await width.evaluate((element) => element.validity.valueMissing), true);
      await width.fill("1");
      await width.press("Escape");
      assert.equal(await controls.getAttribute("aria-expanded"), "false");
      assert.equal(await controls.evaluate((element) => document.activeElement === element), true);
      await page.getByRole("button", { name: "追踪所选对象", exact: true }).click();
      const schematic = page.getByRole("region", { name: "设计原理图", exact: true });
      await info.click();
      await schematic.getByText("design · success", { exact: true }).waitFor();
      await info.click();
      await page.waitForFunction(() => {
        const graph = document.querySelector(".demo-graph"),
          canvas = document.querySelector(".hier-schematic-view__canvas");
        return canvas.clientHeight > graph.clientHeight * 0.6;
      });
      const wideCanvas = await page.locator(".hier-schematic-view__canvas").boundingBox();
      await schematic.getByRole("button", { name: "布局", exact: true }).click();
      await schematic.locator('[role="status"]').getByText("success", { exact: true }).waitFor();
      const svgBefore = await schematic.locator("svg").innerHTML();
      const view = page.getByRole("group", { name: "工作区视图", exact: true });
      async function expectSplit(orientation) {
        await page.waitForFunction((direction) => {
          const graph = document.querySelector(".demo-graph-slot").getBoundingClientRect();
          const source = document.querySelector(".demo-source-workspace").getBoundingClientRect();
          return (
            graph.width > 0 &&
            graph.height > 0 &&
            source.width > 0 &&
            source.height > 0 &&
            (direction === "horizontal"
              ? graph.right <= source.left && Math.abs(graph.top - source.top) < 2
              : graph.bottom <= source.top && Math.abs(graph.left - source.left) < 2)
          );
        }, orientation);
        assert.equal(await schematic.locator("svg").innerHTML(), svgBefore);
        assert.equal(await source.locator("code").textContent(), text);
        assert.equal(
          await source.locator("code").evaluate((code) => code === window.aWorkspaceSource),
          true,
          "changing split direction preserves the original source document",
        );
      }
      await view.getByRole("button", { name: "双视图", exact: true }).click();
      await expectSplit("horizontal");
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        "双视图",
        "presenting two panes retains the mode control focus",
      );
      const splitDivider = page.getByRole("separator", { name: "原理图与源码分隔", exact: true });
      const splitSize = () => splitDivider.getAttribute("aria-valuenow").then(Number);
      async function dragSplit(delta, cancel = false) {
        const box = await splitDivider.boundingBox();
        const stacked = (await splitDivider.getAttribute("aria-orientation")) === "horizontal";
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + (stacked ? 0 : delta), y + (stacked ? delta : 0), { steps: 4 });
        if (cancel) await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      async function checkSplitSizing(stacked) {
        const initial = await splitSize();
        assert.equal(
          await splitDivider.getAttribute("aria-orientation"),
          stacked ? "horizontal" : "vertical",
        );
        await dragSplit(40);
        assert.equal(await splitSize(), initial + 40);
        const graphBox = await page.locator(".demo-graph-slot").boundingBox();
        assert(Math.abs((stacked ? graphBox.height : graphBox.width) - (initial + 40)) < 2);
        await splitDivider.focus();
        await page.keyboard.press(stacked ? "ArrowDown" : "ArrowRight");
        assert.equal(await splitSize(), initial + 60);
        await page.keyboard.press(stacked ? "ArrowUp" : "ArrowLeft");
        assert.equal(await splitSize(), initial + 40);
        await page.keyboard.press("Home");
        assert.equal(await splitSize(), Number(await splitDivider.getAttribute("aria-valuemin")));
        await page.keyboard.press("End");
        assert.equal(await splitSize(), Number(await splitDivider.getAttribute("aria-valuemax")));
        await page.keyboard.press("Enter");
        assert.equal(await splitSize(), initial);
        await dragSplit(40);
        await dragSplit(-25, true);
        assert.equal(await splitSize(), initial + 40, "Escape restores the active split size");
        await splitDivider.dblclick();
        assert.equal(await splitSize(), initial);
        await dragSplit(40);
        await expectSplit(stacked ? "vertical" : "horizontal");
        return initial + 40;
      }
      const wideSplitPreference = await checkSplitSizing(false);
      await screenshot("split-resized-wide.png");
      if (process.env.HIER_A_WORKSPACE_SCREENSHOTS) {
        await page.screenshot({
          path: path.join(process.env.HIER_A_WORKSPACE_SCREENSHOTS, "split-wide.png"),
        });
      }
      await view.getByRole("button", { name: "原理图", exact: true }).click();
      assert.equal(await source.isVisible(), false);
      assert.equal(await splitDivider.isVisible(), false);
      assert.equal(await schematic.isVisible(), true);
      await view.getByRole("button", { name: "源码", exact: true }).click();
      assert.equal(await schematic.isVisible(), false);
      assert.equal(await source.locator("code").textContent(), text);
      assert.equal(
        await source.locator("code").evaluate((code) => code === window.aWorkspaceSource),
        true,
      );
      assert.equal(await candidates.locator("ul").textContent(), candidateText);
      await view.getByRole("button", { name: "原理图", exact: true }).click();
      assert.equal(
        await schematic.locator("svg").innerHTML(),
        svgBefore,
        "switching view does not relayout/reset graph",
      );
      assert.equal(
        await page.locator('[role="treeitem"][aria-selected="true"]').textContent(),
        beforeSelection,
      );
      if (process.env.HIER_A_WORKSPACE_SCREENSHOTS) {
        await page.screenshot({
          path: path.join(process.env.HIER_A_WORKSPACE_SCREENSHOTS, "graph.png"),
        });
      }
      const canvasBeforeQueries = await page.locator(".hier-schematic-view__canvas").boundingBox();
      await queryToggle.click();
      await page.waitForFunction(
        (height) => document.querySelector(".hier-schematic-view__canvas").clientHeight > height,
        canvasBeforeQueries.height,
      );
      assert.equal(
        await schematic.locator("svg").innerHTML(),
        svgBefore,
        "query folding does not relayout the graph",
      );
      await screenshot("queries-collapsed-graph.png");
      await queryToggle.click();
      const navigationDivider = page.getByRole("separator", { name: "设计导航宽度" });
      const inspectorDivider = page.getByRole("separator", { name: "对象详情宽度" });
      const currentWidth = async (divider) => Number(await divider.getAttribute("aria-valuenow"));
      async function dragDivider(divider, delta, cancel = false) {
        const box = await divider.boundingBox();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + delta, y, { steps: 5 });
        if (cancel) await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      const defaultNavigation = await currentWidth(navigationDivider);
      const defaultInspector = await currentWidth(inspectorDivider);
      await screenshot("sidebar-default-wide.png");
      await dragDivider(inspectorDivider, -160);
      assert.equal(await currentWidth(inspectorDivider), defaultInspector + 160);
      await dragDivider(navigationDivider, 70);
      assert.equal(await currentWidth(navigationDivider), defaultNavigation + 70);
      await screenshot("sidebar-expanded-wide.png");
      await inspectorDivider.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await currentWidth(inspectorDivider), defaultInspector + 140);
      await page.keyboard.press("ArrowLeft");
      assert.equal(await currentWidth(inspectorDivider), defaultInspector + 160);
      await page.keyboard.press("Home");
      assert.equal(
        await currentWidth(inspectorDivider),
        Number(await inspectorDivider.getAttribute("aria-valuemin")),
      );
      await page.keyboard.press("End");
      assert.equal(
        await currentWidth(inspectorDivider),
        Number(await inspectorDivider.getAttribute("aria-valuemax")),
      );
      await page.keyboard.press("Enter");
      assert.equal(await currentWidth(inspectorDivider), defaultInspector);
      await dragDivider(inspectorDivider, -160);
      await dragDivider(inspectorDivider, 50, true);
      assert.equal(
        await currentWidth(inspectorDivider),
        defaultInspector + 160,
        "Escape restores drag start",
      );
      await view.getByRole("button", { name: "对象详情", exact: true }).click();
      assert.equal(await inspectorDivider.isVisible(), false);
      await view.getByRole("button", { name: "对象详情", exact: true }).click();
      assert.equal(await currentWidth(inspectorDivider), defaultInspector + 160);
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(960, 640),
      );
      await page.waitForFunction(
        () =>
          document.querySelector(".demo-center").clientWidth >= 320 &&
          document.querySelector(".demo-right").clientWidth < 400,
      );
      assert(
        (await page.locator(".demo-right").boundingBox()).x +
          (await page.locator(".demo-right").boundingBox()).width <=
          960,
      );
      await screenshot("sidebar-constrained-small.png");
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1440, 968),
      );
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="对象详情宽度"]').getAttribute("aria-valuenow") ===
          "460",
      );
      assert.equal(await currentWidth(navigationDivider), defaultNavigation + 70);
      assert.equal(
        await schematic.locator("svg").innerHTML(),
        svgBefore,
        "sidebar resize preserves graph geometry",
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector(".demo-source-workspace code") === window.aWorkspaceSource,
        ),
        true,
      );
      assert.equal(
        await page.locator('[role="treeitem"][aria-selected="true"]').textContent(),
        beforeSelection,
      );
      await navigationDivider.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await currentWidth(navigationDivider), defaultNavigation + 90);
      await page.keyboard.press("Enter");
      assert.equal(await currentWidth(navigationDivider), defaultNavigation);
      await inspectorDivider.dblclick();
      assert.equal(await currentWidth(inspectorDivider), defaultInspector);
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(960, 640),
      );
      await page.waitForFunction(
        (height) => document.querySelector(".hier-schematic-view__canvas").clientHeight < height,
        wideCanvas.height,
      );
      const narrowCanvas = await page.locator(".hier-schematic-view__canvas").boundingBox();
      await view.getByRole("button", { name: "对象详情", exact: true }).click();
      await view.getByRole("button", { name: "设计导航", exact: true }).click();
      await page.waitForFunction(
        (width) => document.querySelector(".hier-schematic-view__canvas").clientWidth > width,
        narrowCanvas.width,
      );
      assert.equal(
        await schematic.locator("svg").innerHTML(),
        svgBefore,
        "resizing and hiding sidebars do not relayout graph",
      );
      await view.getByRole("button", { name: "设计导航", exact: true }).click();
      await view.getByRole("button", { name: "对象详情", exact: true }).click();
      await view.getByRole("button", { name: "双视图", exact: true }).click();
      await expectSplit("vertical");
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(960, 1100),
      );
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector('[aria-label="原理图与源码分隔"]').getAttribute("aria-valuemax"),
          ) > 420,
      );
      const stackedSplitPreference = await checkSplitSizing(true);
      await screenshot("split-resized-stacked.png");
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(960, 640),
      );
      await page.waitForFunction(
        (size) =>
          Number(
            document.querySelector('[aria-label="原理图与源码分隔"]').getAttribute("aria-valuenow"),
          ) < size,
        stackedSplitPreference,
      );
      const tabBounds = await tabs.boundingBox();
      for (const tab of await tabs.getByRole("tab").all()) {
        const bounds = await tab.boundingBox();
        assert(bounds.x >= tabBounds.x && bounds.x + bounds.width <= tabBounds.x + tabBounds.width);
      }
      if (process.env.HIER_A_WORKSPACE_SCREENSHOTS) {
        await page.screenshot({
          path: path.join(process.env.HIER_A_WORKSPACE_SCREENSHOTS, "split-small.png"),
        });
      }
      await view.getByRole("button", { name: "对象详情", exact: true }).click();
      await view.getByRole("button", { name: "设计导航", exact: true }).click();
      await expectSplit("horizontal");
      assert.equal(
        await splitSize(),
        wideSplitPreference,
        "responsive axis restores its own preference",
      );
      if (process.env.HIER_A_WORKSPACE_SCREENSHOTS) {
        await page.screenshot({
          path: path.join(process.env.HIER_A_WORKSPACE_SCREENSHOTS, "split-small-expanded.png"),
        });
      }
      await view.getByRole("button", { name: "设计导航", exact: true }).click();
      await view.getByRole("button", { name: "对象详情", exact: true }).click();
      await view.getByRole("button", { name: "源码", exact: true }).click();
      await view.getByRole("button", { name: "双视图", exact: true }).click();
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(960, 1100),
      );
      await page.waitForFunction(
        (size) =>
          Number(
            document.querySelector('[aria-label="原理图与源码分隔"]').getAttribute("aria-valuenow"),
          ) === size,
        stackedSplitPreference,
      );
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(960, 640),
      );
      await view.getByRole("button", { name: "源码", exact: true }).click();
      await queryToggle.click();
      assert.equal(await queries.isVisible(), false);
      await screenshot("queries-collapsed-small.png");
      const target = candidates
        .locator("ul > li > button")
        .filter({ hasText: / · 对象$/ })
        .first();
      await target.scrollIntoViewIfNeeded();
      await target.click();
      assert.equal(
        await source.locator("code").textContent(),
        text,
        "native candidate confirm preserves source at small size",
      );
      assert.equal(
        await tabs.getByRole("tab", { name: "实例属性" }).getAttribute("aria-selected"),
        "true",
      );
      if (process.env.HIER_A_WORKSPACE_SCREENSHOTS) {
        await page.screenshot({
          path: path.join(process.env.HIER_A_WORKSPACE_SCREENSHOTS, "small-source.png"),
        });
      }
      // A real graph point carries a one-bit selection. Changing only connection side keeps it.
      await view.getByRole("button", { name: "原理图", exact: true }).click();
      const point = schematic
        .locator('g[data-graph-key^="node:"]')
        .filter({ hasText: portRef })
        .first();
      await point.click();
      await tabs.getByRole("tab", { name: "对象连接", exact: true }).click();
      await connections.getByRole("button", { name: "刷新", exact: true }).waitFor();
      assert.equal(await summary("请求位段").textContent(), "lsb: 0, width: 1");
      assert.equal(await connectionSide.inputValue(), "inside");
      const graphSelection = await schematic
        .locator('g[aria-pressed="true"]')
        .getAttribute("data-graph-key");
      // The graph selection intentionally loads its source; capture that current document identity.
      const pointDocument = page
        .getByRole("region", { name: "设计源码", exact: true, includeHidden: true })
        .locator("code");
      const pointSource = await pointDocument.elementHandle();
      await connectionSide.selectOption("outside");
      await connections
        .getByText("bad_request: top ports have only an inside", { exact: true })
        .waitFor();
      assert.equal(await summary("查询对象").textContent(), portRef);
      assert.equal(await summary("请求位段").textContent(), "lsb: 0, width: 1");
      assert.equal(await summary("reach").textContent(), "local");
      assert.equal(await summary("side").textContent(), "outside");
      assert.equal(
        await schematic.locator('g[aria-pressed="true"]').getAttribute("data-graph-key"),
        graphSelection,
      );
      assert.equal(
        await pointDocument.evaluate((code, original) => code === original, pointSource),
        true,
      );
      assert.equal(
        await page.getByRole("combobox", { name: "追踪侧", exact: true }).inputValue(),
        "inside",
      );
      const connectionBox = await connections.boundingBox();
      assert(connectionBox.height > 0 && connectionBox.y + connectionBox.height <= 640);
      await connectionSide.selectOption("inside");
      await connections.getByRole("button", { name: "刷新", exact: true }).waitFor();
      assert.equal(await summary("请求位段").textContent(), "lsb: 0, width: 1");
      await screenshot("connections-one-bit-small.png");
      await page.getByRole("button", { name: "收起原理图", exact: true }).click();
      assert.equal(await source.isVisible(), true);
      await navigationDivider.focus();
      await page.keyboard.press("ArrowRight");
      const navigationBeforeClose = await currentWidth(navigationDivider);
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.getByText("设计已关闭", { exact: true }).waitFor();
      assert.equal(await notice.count(), 0, "detaching the design clears its old notice");
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      assert.equal(await candidates.isVisible(), false);
      assert.equal(await queries.isVisible(), true, "new design starts with direct query entry");
      assert.equal(await querySearch.inputValue(), "");
      assert.equal(await queryPath.inputValue(), "");
      assert.equal(
        await currentWidth(navigationDivider),
        navigationBeforeClose - 20,
        "new design resets presentation preferences",
      );
      assert.equal(await notice.count(), 0, "reopened design does not inherit operation feedback");
      assert.equal(await page.getByRole("tabpanel").count(), 1);
      await tabs.getByRole("tab", { name: "对象连接", exact: true }).click();
      await connections.getByText("尚未指定连接目标", { exact: true }).waitFor();
      assert.equal(await connectionSide.isDisabled(), true);
      assert.equal(await connectionSide.inputValue(), "");
      await page.getByRole("button", { name: "源码候选 展开", exact: true }).click();
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1440, 968),
      );
      await page.waitForFunction(
        (size) =>
          Number(
            document.querySelector('[aria-label="源码候选高度"]').getAttribute("aria-valuemax"),
          ) > size,
        defaultCandidateSize,
      );
      assert.equal(
        await candidateSize(),
        defaultCandidateSize,
        "new design resets candidate height",
      );
      await page.getByRole("button", { name: "源码候选 收起", exact: true }).click();
      await page.getByRole("button", { name: "显示原理图", exact: true }).click();
      await view.getByRole("button", { name: "双视图", exact: true }).click();
      await page.waitForFunction(() => {
        const graph = document.querySelector(".demo-graph-slot").getBoundingClientRect();
        const source = document.querySelector(".demo-source-workspace").getBoundingClientRect();
        return graph.right < source.left && Math.abs(graph.width - source.width) < 2;
      });
      assert.deepEqual(errors, []);
    } finally {
      await electron.close();
    }
  },
);

test(
  "A: source action follows the real request and retains keyboard focus",
  { timeout: 30_000 },
  async () => {
    assert(process.env.HIER_BIN, "explicit real Core");
    const electron = await _electron.launch({
      executablePath: binary,
      args: [app],
      env: process.env,
    });
    let pausedCore;
    function pauseCore() {
      const children = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,args="], {
        encoding: "utf8",
      })
        .split("\n")
        .flatMap((line) => {
          const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
          return match &&
            Number(match[2]) === electron.process().pid &&
            (match[3] === process.env.HIER_BIN || match[3].startsWith(process.env.HIER_BIN + " "))
            ? [Number(match[1])]
            : [];
        });
      assert.equal(children.length, 1, "pause only this Electron's unique real Core child");
      pausedCore = children[0];
      process.kill(pausedCore, "SIGSTOP");
    }
    function resumeCore() {
      if (pausedCore === undefined) return;
      process.kill(pausedCore, "SIGCONT");
      pausedCore = undefined;
    }
    try {
      await electron.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      }, design);
      const page = await electron.firstWindow();
      page.setDefaultTimeout(7000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const source = page.getByRole("region", { name: "设计源码", exact: true });
      const controls = page.locator(".demo-source-controls");
      const refresh = controls.getByRole("button", { name: "刷新源码", exact: true });
      const cancel = controls.getByRole("button", { name: "取消源码请求", exact: true });
      async function screenshot(name) {
        if (process.env.HIER_A_WORKSPACE_SCREENSHOTS) {
          await page.screenshot({
            path: path.join(process.env.HIER_A_WORKSPACE_SCREENSHOTS, name),
          });
        }
      }
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      assert.equal(await controls.getByRole("button").count(), 1);
      assert.equal(await refresh.isDisabled(), true);
      const action = await refresh.elementHandle();
      const sameFocusedAction = () =>
        action.evaluate(
          (node) =>
            node.isConnected &&
            node === document.activeElement &&
            node === document.querySelector(".demo-source-controls button"),
        );
      await page.getByRole("treeitem").first().click();
      await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
      const text = await source.locator("code").textContent();
      const selected = await page.locator('[role="treeitem"][aria-selected="true"]').textContent();
      assert.equal(await refresh.isEnabled(), true);
      assert.equal(await cancel.count(), 0, "no idle cancellation action");
      await screenshot("source-action-ready.png");

      // Hold the real process, not a fake reply or a timing race. Local cancellation must still work.
      pauseCore();
      await refresh.focus();
      await page.keyboard.press("Enter");
      await source.getByText("正在加载源码", { exact: true }).waitFor();
      assert.equal(await controls.getByRole("button").count(), 1);
      assert.equal(await cancel.isEnabled(), true);
      assert.equal(await sameFocusedAction(), true);
      await screenshot("source-action-pending.png");
      await page.keyboard.press("Enter");
      await source.getByText("源码加载已取消", { exact: true }).waitFor();
      assert.equal(await refresh.isEnabled(), true);
      assert.equal(await sameFocusedAction(), true, "completion keeps the same focused action");
      await screenshot("source-action-cancelled.png");
      resumeCore();
      await page.keyboard.press("Enter");
      await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
      assert.equal(await source.locator("code").textContent(), text);
      assert.equal(await sameFocusedAction(), true);

      pauseCore();
      await refresh.click();
      await source.getByText("正在加载源码", { exact: true }).waitFor();
      const search = page.getByRole("textbox", { name: "搜索", exact: true });
      await search.fill("keep source request focus");
      resumeCore();
      await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
      assert.equal(await search.evaluate((node) => node === document.activeElement), true);
      assert.equal(
        await page.locator('[role="treeitem"][aria-selected="true"]').textContent(),
        selected,
      );

      // A top-level instance has no instantiation source; the original Core failure stays visible.
      await page
        .getByRole("combobox", { name: "源码范围", exact: true })
        .selectOption("instantiation");
      await source.getByText("源码加载失败", { exact: true }).waitFor();
      const diagnostic = await source.getByRole("status").textContent();
      assert.equal(await refresh.isEnabled(), true);
      pauseCore();
      await refresh.click();
      await source.getByText("正在加载源码", { exact: true }).waitFor();
      resumeCore();
      await source.getByText("源码加载失败", { exact: true }).waitFor();
      assert.equal(await source.getByRole("status").textContent(), diagnostic);
      assert.equal(await sameFocusedAction(), true);
      await screenshot("source-action-failed.png");
      await page
        .getByRole("combobox", { name: "源码范围", exact: true })
        .selectOption("definition");
      await source.locator("code").filter({ hasText: "assign y = mid" }).waitFor();
      await page.getByRole("button", { name: "关闭设计", exact: true }).click();
      await page.getByText("设计已关闭", { exact: true }).waitFor();
      assert.equal(await action.evaluate((node) => node.isConnected), false);
      await page.getByRole("button", { name: "打开设计", exact: true }).click();
      await page.waitForSelector('.demo-status[data-phase="ready"]');
      assert.equal(await refresh.isDisabled(), true);
      assert.equal(await controls.getByRole("button").count(), 1);
      assert.equal(await source.locator("code").count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      try {
        resumeCore();
      } finally {
        await electron.close();
      }
    }
  },
);

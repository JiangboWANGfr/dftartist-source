// B101-UI-01: concrete original real-design counterexample, not a new UI category.
// DESIGN 6.27.3/.4 and existing SourceCandidatesView native pointer confirmation.
// Opt-in; the original 26 and cleanup DR02/03 remain unchanged.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { uiCommand } from "./ui.mjs";
const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT),
  tools = fs.realpathSync(process.env.HIER_B_BROWSER_TOOLS),
  bin = fs.realpathSync(process.env.HIER_BIN),
  vc = fs.realpathSync(process.env.HIER_B_PROCESSOR_FILELIST);
const packageRoot = fs.existsSync(product + "/web/package.json") ? product + "/web" : product,
  appDir =
    process.env.HIER_B_DEMO_APP_DIR ??
    (packageRoot === product ? product + "/app" : packageRoot + "/apps/demo"),
  req = createRequire(tools + "/package.json"),
  outer = createRequire(packageRoot + "/package.json"),
  { _electron } = req("playwright");
const r = {
  id: "B101-UI-01",
  input:
    "original processor_core filelist, GPIO_2 p1_dout declaration; graph visible; 1440x968 content viewport; explicit GPIO_1 candidate native pointer",
  expected:
    "candidate list has usable positive height; intended enabled row is pointer-reachable; click confirms GPIO_1 without replacing original source document",
  basis: "DESIGN 6.27.3/.4 and original SourceCandidatesView pointer/confirmation contract",
  product,
  vc,
  passed: false,
  errors: [],
};
let app, page, proc;
try {
  const env = { ...process.env, HIER_BIN: bin };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: outer("electron"),
    args: [appDir],
    env,
    timeout: 20000,
  });
  proc = app.process();
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => r.errors.push(String(e)));
  await page.getByRole("button", { name: "打开设计", exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 968),
  );
  const ui = async (a, x) => {
      let timer;
      try {
        return await Promise.race([
          page.evaluate(
            "(" +
              uiCommand.toString() +
              ")(" +
              JSON.stringify(a) +
              "," +
              JSON.stringify(x ?? null) +
              ")",
          ),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error("B UI binding watchdog: " + a)), 10000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    point = async (a, x) => {
      const p = await ui(a, x);
      await page.mouse.click(p.x, p.y);
    };
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, vc);
  await page.locator("select").first().selectOption("filelist");
  await page.getByRole("textbox", { name: "顶层", exact: true }).fill("processor_core");
  await page.getByRole("button", { name: "打开设计", exact: true }).click();
  await page.getByRole("treeitem").first().waitFor();
  const props = page.getByRole("region", { name: "实例属性", exact: true }),
    source = page.getByRole("region", { name: "设计源码", exact: true }),
    candidates = page.getByRole("region", { name: "源码候选", exact: true });
  async function select(name) {
    await ui("input", { kind: "path", value: "processor_core." + name });
    await point("submitPoint", "path");
    await point("choicePoint", { region: "path", text: name });
    await ui("property", name);
  }
  await select("GPIO_1");
  const instance = await props.evaluate(
    (e) =>
      [...e.querySelectorAll("dt")].find((x) => x.textContent === "实例引用").nextElementSibling
        .textContent,
  );
  await select("GPIO_2");
  await props
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "p1_dout", exact: true }) })
    .getByRole("button", { name: /选择端口/ })
    .click();
  await page.getByRole("button", { name: "显示原理图", exact: true }).click();
  // B103: preserve this freeze's simultaneous graph/source input through the public mode control.
  const dualView = page.getByRole("button", { name: "双视图", exact: true });
  if (await dualView.isVisible()) await dualView.click();
  const original = fs.readFileSync(path.join(path.dirname(vc), "omsp_gpio.v"), "utf8"),
    lines = original.split("\n"),
    line = lines.findIndex((l) => /^output\s+\[7:0\]\s+p1_dout;/.test(l)) + 1,
    column = lines[line - 1].indexOf("p1_dout") + 1,
    pos = { line, column, endColumn: column + "p1_dout".length };
  await page.waitForFunction(
    (original) =>
      document.querySelector('section[aria-label="设计源码"] pre code')?.textContent === original,
    original,
  );
  await source.locator("pre").focus();
  await source.locator("code").evaluate((code, pos) => {
    const offset =
        code.textContent
          .split("\n")
          .slice(0, pos.line - 1)
          .reduce((n, l) => n + l.length + 1, 0) + pos.column,
      w = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let n,
      at = 0;
    while ((n = w.nextNode())) {
      if (at + n.textContent.length >= offset) {
        getSelection().setBaseAndExtent(n, offset - at, n, offset - at);
        return;
      }
      at += n.textContent.length;
    }
    throw Error("original position absent");
  }, pos);
  await page.keyboard.press("Alt+Enter");
  const chosen = candidates
    .locator("ul > li > button")
    .filter({ hasText: instance })
    .filter({ hasText: line + ":" + column + "–" + line + ":" + pos.endColumn });
  await chosen.waitFor();
  r.candidate = await chosen.innerText();
  r.geometry = await chosen.evaluate((e) => {
    e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const b = e.getBoundingClientRect(),
      h = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
      list = e.closest("ul");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      listHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      centerHitWithin: e.contains(h),
      interceptor: h?.className,
      candidateHeight: b.height,
    };
  });
  const before = await ui("sourceState");
  assert(
    r.geometry.listHeight > 0,
    "enabled source candidate list must have usable positive height",
  );
  assert(
    r.geometry.centerHitWithin,
    "native pointer reaches the actual candidate, not sibling status/operations",
  );
  await chosen.click();
  await ui("property", "GPIO_1");
  assert.deepEqual(await ui("sourceState"), before);
  await page.getByRole("button", { name: "关闭设计", exact: true }).click();
  await page.getByText("设计已关闭", { exact: true }).waitFor();
  assert.deepEqual(r.errors, []);
  r.passed = true;
} catch (e) {
  r.error = String(e.stack ?? e);
  process.exitCode = 1;
  if (page && !page.isClosed()) {
    r.body = await page
      .locator("body")
      .innerText()
      .catch(() => null);
    if (process.env.HIER_B_POINTER_REPORT)
      await page
        .screenshot({ path: process.env.HIER_B_POINTER_REPORT + ".png", fullPage: true })
        .catch(() => {});
  }
} finally {
  if (app) {
    await app.close();
    r.appClosed = true;
    r.appExit = proc.exitCode;
  }
  if (process.env.HIER_B_POINTER_REPORT) {
    assert(path.isAbsolute(process.env.HIER_B_POINTER_REPORT));
    fs.writeFileSync(process.env.HIER_B_POINTER_REPORT, JSON.stringify(r, null, 2) + "\n", {
      flag: "wx",
    });
  }
  console.log(JSON.stringify(r, null, 2));
}

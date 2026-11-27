// "右边这个对话框不是特别好用，学习成本有点高" — the Instance panel mixed three edit scopes
// with only a parenthetical as separation, used "C"/"S" badges that read as Client/Server (the
// real values are Client/Secondary, a Tessent pairing concept unrelated to networking), and only
// caught invalid interface combinations with a toast AFTER the click. This drives the real panel
// on a seeded doc and checks the concrete fixes: a visible "this instance only" scope label, a
// distinctly-styled "Module Definition" (shared-scope) section, spelled-out Client/Secondary
// labels, and the "+ Interface" button disabled with a reason BEFORE the click when the default
// add-row settings would collide with an interface the def already has.
import { test, expect } from "@playwright/test";
import { launchApp } from "../helpers/electron.ts";

// defA already has an SSN client interface (the add-row's own defaults: busType=SSN, role=client)
// — so opening the panel on an instance of defA should show "+ Interface" disabled immediately,
// no clicking required to provoke the collision.
const SEED = {
  schemaVersion: 1,
  library: { defs: [
    { id: "top", designName: "top", designLevel: "chip", designType: "hierarchical", interfaces: [], connections: [],
      childInstances: [
        { id: "iA", instanceName: "A_i1", hardenId: "defA", position: { x: 80, y: 100 } },
      ] },
    { id: "defA", designName: "A", designLevel: "sub_block", designType: "tiling", childInstances: [], connections: [],
      interfaces: [{ id: "ssnif", busType: "SSN", role: "client", busWidth: 4 }] },
  ] },
  ui: { openDefId: "top", rootDefId: "top" },
  ctrlIps: [], dfxInstances: [], moduleDsNext: 1, muxDsNext: 1,
};

test("genconn Instance panel: scope separation, spelled-out roles, proactive validation", async () => {
  test.setTimeout(60_000);
  const { app, page } = await launchApp();
  try {
    await page.evaluate((d) => { (window as any).__gcStore.getState().openText(d); }, JSON.stringify(SEED));
    await page.evaluate(() => (window as any).__dftStore.setState({ status: "ready" }));
    await page.click('[data-tab="genconn"]');
    await expect(page.locator("#ws-genconn")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => (window as any).__gcStore.getState().select({ kind: "instance", id: "iA" }));

    const inspector = page.locator("#gc-inspector");
    // ---- scope separation: "this instance only" vs. the shared, distinctly-tinted def section
    await expect(inspector.locator(".insp-section-scope")).toHaveText(/this instance only/i);
    const sharedSection = inspector.locator(".insp-section-shared");
    await expect(sharedSection).toBeVisible();
    await expect(sharedSection).toContainText("Module Definition");
    await expect(sharedSection).toContainText("Changes affect all");

    // ---- spelled-out role labels, not "C"/"S"
    const roleBadge = inspector.locator(".iface-role").first();
    await expect(roleBadge).toHaveText("Client");
    await expect(roleBadge).not.toHaveText("C");

    // ---- add-row labels are real labels now, not bare controls
    await expect(inspector.locator(".iface-add-field", { hasText: "Protocol" })).toBeVisible();
    await expect(inspector.locator(".iface-add-field", { hasText: "Role" })).toBeVisible();
    await expect(inspector.locator(".iface-add-field", { hasText: "Kind" })).toBeVisible();

    // ---- proactive validation: the default add-row (SSN client) collides with the existing
    // SSN client interface — disabled with a reason, BEFORE any click.
    const addBtn = inspector.getByRole("button", { name: "＋ Interface" });
    await expect(addBtn).toBeDisabled();
    await expect(inspector.locator(".iface-add-blocked")).toContainText("client of this type already exists");

    // Switching role to Secondary clears the collision (a def's role/type combo, not busType,
    // decides the client-uniqueness check) and re-enables the button.
    await inspector.locator(".iface-add-field select").nth(1).selectOption("secondary");
    await expect(addBtn).toBeEnabled();
  } finally {
    await app.close().catch(() => {});
  }
});

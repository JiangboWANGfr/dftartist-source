import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuTemplate } from "../../electron/menu.cjs";

test("文件菜单项点击派发对应 action（占位命令，无加速键）", () => {
  const sent: string[] = [];
  const tmpl = buildMenuTemplate((action) => sent.push(action));
  const items = tmpl.flatMap((m) => m.submenu ?? []);
  const save = items.find((i) => i.label === "Save");
  assert.ok(save?.click, "missing Save menu item");
  save.click();
  assert.deepEqual(sent, ["save"]);
});

test("不注册与 genconn 渲染层冲突的加速键（⌘S/⌘Z/⌘⇧Z）", () => {
  // 这些快捷键由 genconn 画布渲染层（真实保存/撤销/重做）负责——菜单再挂会在 macOS 上
  // 吞掉按键、把 ⌘S 导向占位 handler 造成丢数据。守卫防回归。
  const tmpl = buildMenuTemplate(() => {});
  const accels = tmpl.flatMap((m) => m.submenu ?? []).map((i) => i.accelerator).filter(Boolean);
  for (const bad of ["CmdOrCtrl+S", "CmdOrCtrl+Z", "CmdOrCtrl+Shift+Z"]) {
    assert.ok(!accels.includes(bad), `不应注册冲突加速键 ${bad}`);
  }
});

test("视图菜单含三个工作区切换（accel ⌘1/2/3）", () => {
  const tmpl = buildMenuTemplate(() => {});
  const accels = tmpl.flatMap((m) => m.submenu ?? [])
    .map((i) => i.accelerator).filter(Boolean);
  assert.ok(accels.includes("CmdOrCtrl+1"));
  assert.ok(accels.includes("CmdOrCtrl+2"));
  assert.ok(accels.includes("CmdOrCtrl+3"));
});

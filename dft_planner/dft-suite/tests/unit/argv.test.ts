import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLaunchArgs, USAGE } from "../../electron/argv.cjs";

test("无参数 → 全 null", () => {
  assert.deepEqual(parseLaunchArgs(["/app/dft-suite"], "/cwd"),
    { projectDir: null, filelist: null, specLogicTestDir: null, compiledDir: null, dftCfgDir: null });
});

test("成对 --projectpath/--harden → 拼接 projectDir(dft_cfg 同约定推导)", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--projectpath", "/proj", "--harden", "h1"], "/cwd"),
    { projectDir: "/proj/h1", filelist: null,
      specLogicTestDir: "/proj/dft_studio_db/h1/spec/logic_test",
      compiledDir: "/proj/dft_studio_db/h1/compiled",
      dftCfgDir: "/proj/dft_studio_db/h1/yaml/dft_cfg" });
});

test("--key=value 写法", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--projectpath=/proj", "--harden=h1", "--filelist=/a/b.f"], "/cwd"),
    { projectDir: "/proj/h1", filelist: "/a/b.f",
      specLogicTestDir: "/proj/dft_studio_db/h1/spec/logic_test",
      compiledDir: "/proj/dft_studio_db/h1/compiled",
      dftCfgDir: "/proj/dft_studio_db/h1/yaml/dft_cfg" });
});

test("相对路径按 cwd resolve", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--projectpath", "proj", "--harden", "h1", "--filelist", "x.f"], "/base"),
    { projectDir: "/base/proj/h1", filelist: "/base/x.f",
      specLogicTestDir: "/base/proj/dft_studio_db/h1/spec/logic_test",
      compiledDir: "/base/proj/dft_studio_db/h1/compiled",
      dftCfgDir: "/base/proj/dft_studio_db/h1/yaml/dft_cfg" });
});

test("单独 --filelist：只给 filelist", () => {
  assert.deepEqual(parseLaunchArgs(["exe", "--filelist", "/a.f"], "/cwd"),
    { projectDir: null, filelist: "/a.f", specLogicTestDir: null, compiledDir: null, dftCfgDir: null });
});

// 显式 --dftcfg 覆盖推导 —— harden 目录名 ≠ design_name 时 Qt 传真实路径。
test("--dftcfg 显式传入优先于推导", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--projectpath", "/proj", "--harden", "design_x",
                     "--dftcfg", "/proj/dft_studio_db/harden_y/yaml/dft_cfg"], "/cwd"),
    { projectDir: "/proj/design_x", filelist: null,
      specLogicTestDir: "/proj/dft_studio_db/design_x/spec/logic_test",
      compiledDir: "/proj/dft_studio_db/design_x/compiled",
      dftCfgDir: "/proj/dft_studio_db/harden_y/yaml/dft_cfg" });
});

test("只传 --projectpath → error", () => {
  const r = parseLaunchArgs(["exe", "--projectpath", "/proj"], "/cwd");
  assert.ok("error" in r && r.error.includes("together"));
});

test("只传 --harden → error", () => {
  const r = parseLaunchArgs(["exe", "--harden", "h1"], "/cwd");
  assert.ok("error" in r && r.error.includes("together"));
});

test("flag 缺值 → error", () => {
  const r = parseLaunchArgs(["exe", "--projectpath"], "/cwd");
  assert.ok("error" in r);
});

test("值位置出现下一个 flag → error(不吞 flag)", () => {
  const r = parseLaunchArgs(["exe", "--projectpath", "--harden", "h1"], "/cwd");
  assert.ok("error" in r);
});

test("未知参数(chromium/user-data-dir)忽略", () => {
  assert.deepEqual(
    parseLaunchArgs(["exe", "--user-data-dir=/tmp/x", "--no-sandbox", "--projectpath", "/p", "--harden", "h"], "/cwd"),
    { projectDir: "/p/h", filelist: null,
      specLogicTestDir: "/p/dft_studio_db/h/spec/logic_test",
      compiledDir: "/p/dft_studio_db/h/compiled",
      dftCfgDir: "/p/dft_studio_db/h/yaml/dft_cfg" });
});

test("USAGE 非空", () => {
  assert.ok(USAGE.includes("--projectpath") && USAGE.includes("--dftcfg"));
});

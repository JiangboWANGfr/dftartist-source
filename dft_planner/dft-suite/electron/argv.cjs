// CLI 启动参数纯解析(spec docs/specs/2026-07-21-cli-launch-args-design.md §1-§2)。
// 扫描整个 argv 找已知 flag——位置无关，天然忽略 electron/chromium 自身参数
// 与打包(argv[0]=exe)/dev(electron main.cjs ...)前缀差异。
const path = require("node:path");

const USAGE = `usage: dft-suite [--projectpath <dir> --harden <name>] [--filelist <file>] [--dftcfg <dir>]
  --projectpath <dir>   project root (must be paired with --harden)
  --harden <name>       harden name; project dir = <projectpath>/<harden>
  --filelist <file>     design filelist (optional; load manually in the app if omitted)
  --dftcfg <dir>        harden's yaml/dft_cfg dir (optional; derived from projectpath/harden
                        when omitted: <projectpath>/dft_studio_db/<harden>/yaml/dft_cfg)
`;

const KEYS = ["projectpath", "harden", "filelist", "dftcfg"];

/** @param {string[]} argv @param {string} cwd
 *  @returns {{projectDir:string|null, filelist:string|null} | {error:string}} */
function parseLaunchArgs(argv, cwd) {
  const got = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a !== "string" || !a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (!KEYS.includes(key)) continue;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    if (typeof val !== "string" || val === "" || val.startsWith("--")) return { error: `--${key} requires a value` };
    got[key] = val;
  }
  if ((got.projectpath == null) !== (got.harden == null)) {
    return { error: "--projectpath and --harden must be provided together" };
  }
  return {
    projectDir: got.projectpath != null ? path.join(path.resolve(cwd, got.projectpath), got.harden) : null,
    filelist: got.filelist != null ? path.resolve(cwd, got.filelist) : null,
    // Where DFT Studio keeps this harden's logic-test spec — the OCC plan
    // (dfx_occ_def_point.tcl) auto-writes here so the GUI and the flow share one file.
    specLogicTestDir: got.projectpath != null
      ? path.join(path.resolve(cwd, got.projectpath), "dft_studio_db", got.harden, "spec", "logic_test")
      : null,
    // gen_dft.pl's parse_sdc_to_yaml output tree (clock_info_from_func_sdc.yaml,
    // dft_clock_define.tcl, dft_clock_mapping.tcl) — the SDC tab's clockgen port writes here too,
    // so it lands beside whatever the flow's own gen_dft.pl run already produced.
    compiledDir: got.projectpath != null
      ? path.join(path.resolve(cwd, got.projectpath), "dft_studio_db", got.harden, "compiled")
      : null,
    // The harden's dft_cfg YAMLs (dft_lib_setting / dft_user_ins_setting / …): the planner
    // edits them in the DFT Config tab and parses them to auto-recognize libraries
    // (membistlib dir, DFX IP files). Explicit --dftcfg wins (harden dir ≠ design_name
    // cases); else the same <projectpath>/dft_studio_db/<harden> convention as the spec dir.
    dftCfgDir: got.dftcfg != null
      ? path.resolve(cwd, got.dftcfg)
      : got.projectpath != null
        ? path.join(path.resolve(cwd, got.projectpath), "dft_studio_db", got.harden, "yaml", "dft_cfg")
        : null,
  };
}

module.exports = { parseLaunchArgs, USAGE };

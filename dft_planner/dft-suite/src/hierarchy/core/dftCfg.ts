// dft_cfg YAML 识别(library auto-recognition)。这些 YAML 的值大多是嵌在 block scalar 里的
// Tessent 命令行片段,所以解析走"逐行找命令"而不是完整 YAML 结构化解析——需要的只是三类
// 事实:membistlib 目录、memory Verilog 目录、DFX IP 的 verilog 文件表。注释行(#)一律跳过。

/** 从 dft_lib_setting.yaml 文本中取 membistlib 目录:
 *  `set_design_sources -format tcd_memory -y <dir> …` 的 -y 参数(提及 tcd_memory 的行)。
 *  兜底:memverilog 块的 `read_verilog <dir>/*.v` 的目录(同一个库目录的另一种写法)。 */
export function parseMembistDir(libYaml: string): string | null {
  for (const raw of libYaml.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("#")) continue;
    if (!/tcd_memory/.test(l)) continue;
    const m = l.match(/-y\s+(\S+)/);
    if (m) return m[1];
  }
  for (const raw of libYaml.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("#")) continue;
    const m = l.match(/^read_verilog\s+(\S+)\/\*\.v\b/);
    if (m) return m[1];
  }
  return null;
}

/** 从 dft_user_ins_setting.yaml 文本中取 DFX IP 的 Verilog 文件(dfx_ip 块的
 *  `read_verilog <file>.v` 行)。`$prj_path`/`${prj_path}` 替换为工程根目录。
 *  只认 .v/.sv 文件行——read_icl 等别的命令不属于 read_dfx_ip 的输入。 */
export function parseDfxIpFiles(insYaml: string, prjPath: string): string[] {
  const out: string[] = [];
  for (const raw of insYaml.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("#")) continue;
    const m = l.match(/^read_verilog\s+(\S+\.s?v)\b/);
    if (!m) continue;
    const f = m[1].replace(/\$\{prj_path\}|\$prj_path/g, prjPath);
    if (f.includes("*")) continue;   // glob 属于库目录(memverilog),不是单个 IP 文件
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

/** projectDir = <projectpath>/<harden> → 工程根目录(YAML 里 $prj_path 的值)。 */
export function prjPathOf(projectDir: string): string {
  return projectDir.replace(/\/+$/, "").replace(/\/[^/]+$/, "");
}

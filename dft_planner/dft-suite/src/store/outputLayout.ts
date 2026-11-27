// 各生成器产物 → 工程结构化目录 relPath 的纯映射(不碰 IO)。spec §3。
export type OutFile = { relPath: string; text: string };

const leaf = (p: string): string => p.split("/").pop() ?? p;

/** DFX ctrl 三件套:按扩展名 → IP/VERILOG|ICL|TCL/<模块>.<ext>。 */
export function ipFiles(files: { name: string; text: string }[]): OutFile[] {
  return files.map((f) => {
    const b = leaf(f.name);
    const dir = b.endsWith(".v") ? "VERILOG" : b.endsWith(".icl") ? "ICL" : b.endsWith(".tcl") ? "TCL" : "OTHER";
    return { relPath: `IP/${dir}/${b}`, text: f.text };
  });
}

/** 生成器连接产物的干净落盘名(丢掉原始 `.top_level_ports_and_connectionss` 后缀):
 *  主连接文件 → <base>.connection.tcl;其余 *.tcl(feedthrough)→ <base>.feedthrough.tcl。
 *  预览/下载/写工程共用同一名字,三处一致。 */
export function connLeafName(name: string): string {
  const SUF = ".top_level_ports_and_connectionss";
  const b = leaf(name);
  if (b.endsWith(SUF)) return `${b.slice(0, -SUF.length)}.connection.tcl`;
  if (b.endsWith(".tcl")) return `${b.slice(0, -4)}.feedthrough.tcl`;
  return b;
}

/** genconn 连接产物 → Arch/<干净名>。 */
export function archConnectionFiles(files: { name: string; text: string }[]): OutFile[] {
  return files.map((f) => ({ relPath: `Arch/${connLeafName(f.name)}`, text: f.text }));
}

export function specFile(design: string, text: string): OutFile {
  return { relPath: `Spec/${design}.spec`, text };
}

/** 生成的各顶层段 → 分文件:SSN→Spec/ssn、EDT→Spec/edt、EmbeddedBoundaryScan→Spec/bscan;各自包 read_config_data wrapper。
 *  rawJtag1838:1838jtag 域是 command-form tcl(create_dft_specification ...),不是 read_config_data 块,原样落盘,不加 wrapper。 */
export function specFilesBySection(design: string, secs: Record<string, string>, rawJtag1838?: string): OutFile[] {
  const wrap = (s: string) => `read_config_data -in_wrapper $dftspec -rep -from_string {\n${s}\n}\n`;
  const put = (sec: string | undefined, rel: string): OutFile[] => (sec && sec.trim()) ? [{ relPath: rel, text: wrap(sec) }] : [];
  return [
    ...put(secs.SSN, `Spec/ssn/${design}.spec`),
    ...put(secs.EDT, `Spec/edt/${design}.spec`),
    ...put(secs.EmbeddedBoundaryScan, `Spec/bscan/${design}.spec`),
    // 占位/报错文本（无接口、生成失败、无桥接）以 "//" 开头，不落盘（否则会写出无效 tcl 文件）。
    ...(rawJtag1838 && rawJtag1838.trim() && !rawJtag1838.trimStart().startsWith("//") ? [{ relPath: `Spec/1838jtag/${design}.spec`, text: rawJtag1838 }] : []),
  ];
}

export function padFiles(aux: string, bscanOpts: string): OutFile[] {
  const out: OutFile[] = [];
  if (aux.trim()) out.push({ relPath: "Spec/bscan/auxiliary.spec", text: aux });
  if (bscanOpts.trim()) out.push({ relPath: "Spec/bscan/bscan_options.tcl", text: bscanOpts });
  return out;
}

export function withDftPortFile(design: string, text: string): OutFile {
  return { relPath: `design_info/${design}.with_dft_port.v`, text };
}

export function regCountFile(text: string): OutFile {
  return { relPath: "design_info/register_count.tcl", text };
}

/** parse_sdc_to_yaml's two Tessent artifacts (gen_dft.pl:6568-6569) — the add_clock commands and
 *  the clock-name mapping, one file each, matching its exact output names. */
export function clockDefineFile(text: string): OutFile {
  return { relPath: "design_info/dft_clock_define.tcl", text };
}
export function clockMappingFile(text: string): OutFile {
  return { relPath: "design_info/dft_clock_mapping.tcl", text };
}
export function clockInfoYamlFile(text: string): OutFile {
  return { relPath: "design_info/clock_info_from_func_sdc.yaml", text };
}

export function archDocFile(design: string, text: string): OutFile {
  return { relPath: `Arch/${design}.arch`, text };
}

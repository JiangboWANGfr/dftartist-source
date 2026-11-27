# 生成结果写入工程输出目录(§5.4 Phase A)设计

- 日期：2026-07-12
- 状态：设计定稿，待实施
- 范围：把 app **现在已经在产**的生成物,经各面板的「写入工程」按钮,直接写进工程 `outputDir` 下的结构化目录树,不再逐个手动下载。
- 关联：`docs/specs/2026-07-10-ui-redesign-design.md` §5.4(本篇是其落地版);工程模型见 P3b(`useProject` + `.dftproj`)。

## 0. 背景与范围决策

P3b 已建 `.dftproj` 工程模型,`outputDir` 字段已存但**从未被消费**;所有生成物目前只能逐个 `downloadText`(浏览器 blob 下载)或剪贴板/原生保存框。用户要:**生成的文件直接写进对应文件夹,不用每次点下载**。

探查各生成器后确认:用户描述的目标目录是**完整 DFT 流程产物**,而 app 现在只真正产出其中一部分。故拆两期:

- **Phase A(本篇)**:把**现有产物**自动写进结构化目录。
- **Phase B(不在本篇)**:把合并的 `.dftspec` 按类别拆成 ssn/edt/occ/bscan/bisr/ijtag、产 `.arch`(独立于 genconn 文档的架构文件)、PDL 等——需新生成逻辑 + DFT 流程分类,可能动 dft-core。**明确推迟。**

**写盘触发**:每个生成器一个「写入工程」按钮(用户选定的方案 A)。各面板的自动预览(400ms 防抖)保持**只预览**,不写盘,避免磁盘抖动。

## 1. 目标目录结构(根 = 工程目录)

**根 = `.dftproj` 所在目录 = `outputDir`。** 为保证 `.dftproj`、genconn 文档、结构化树三者相对路径一致(避免 `.dftproj` 目录与 `outputDir` 分离导致错位),**新建工程时把 `.dftproj` 写进所选的 `outputDir`**(见 §8),使三者同根。写盘的 `baseDir` = 该目录 = `dirname(project.path)`。

```
${design}.planner.dftproj          ← 工程文件(命名从 _plan 改 .planner)
Arch/
  ${design}.arch                   ← genconn 文档(JSON;与工作文档统一,见 §4)
  <层>.connection.tcl              ← genconn 连接文件(原 .top_level_ports_and_connectionss)
  <层>.feedthrough.tcl             ← genconn ported 层的 feedthrough(仅有时产)
Spec/
  bscan/
    auxiliary.spec                 ← pad 的 read_config_data 段
    bscan_options.tcl              ← pad 的 set_boundary_scan_port_options 段
  ${design}.dftspec                ← specgen 合并 spec(按类别拆分 = Phase B)
IP/
  VERILOG/  <模块>.v               ← DFX ctrl 三件套(按扩展名分目录)
  ICL/      <模块>.icl
  TCL/      <模块>.tcl
design_info/
  register_count.tcl               ← 寄存器统计导出(TCL 可 source 数组,格式见 §5)
  ${design}.with_dft_port.v        ← 注入网表(原 _with_dft.v)
```

`<层>` = 顶层为 `top`,子层为该层 `designName`。`<design>` = 工程 top module / genconn 根 def 的 designName。

## 2. 通用写盘 IPC(核心新增)

现有 electron 层只有"固定单文件 sidecar"或"逐文件原生保存框",**没有通用的写目录**。新增:

- `electron/main.cjs`:`ipcMain.handle("dft:project:writeFiles", async (_e, { baseDir, files }) => {...})`
  - `files: { relPath: string; text: string }[]`。
  - 对每个 file:`const abs = path.join(baseDir, relPath); await fs.mkdir(path.dirname(abs), { recursive: true }); await fs.writeFile(abs, file.text, "utf8");`
  - 返回写入的绝对路径数组 `string[]`(供 UI 反馈)。
- `electron/preload.cjs`:`project.writeFiles: (baseDir, files) => ipcRenderer.invoke("dft:project:writeFiles", { baseDir, files })`
- `src/core-bridge/dft.d.ts`:`project.writeFiles(baseDir: string, files: { relPath: string; text: string }[]): Promise<string[]>`

## 3. 路径映射纯函数(可单测)

新建 `src/store/outputLayout.ts` —— 把各生成器产物映射成结构化 relPath。纯函数,不碰 IO。

```ts
export type OutFile = { relPath: string; text: string };

// DFX ctrl 三件套:按扩展名 → IP/VERILOG|ICL|TCL/<模块>.<ext>
export function ipFiles(files: { name: string; text: string }[]): OutFile[];
// genconn 连接产物:*.top_level_ports_and_connectionss → Arch/<base>.connection.tcl;
//                  *.tcl(feedthrough) → Arch/<base>.feedthrough.tcl。base = 去目录去后缀。
export function archConnectionFiles(files: { name: string; text: string }[]): OutFile[];
// specgen 合并 spec → Spec/<design>.dftspec
export function specFile(design: string, text: string): OutFile;
// pad 两段 → Spec/bscan/{auxiliary.spec, bscan_options.tcl}
export function padFiles(aux: string, bscanOpts: string): OutFile[];
// 注入网表 → design_info/<design>.with_dft_port.v
export function withDftPortFile(design: string, text: string): OutFile;
// 寄存器报告(TCL 可 source)→ design_info/register_count.tcl
export function regCountFile(text: string): OutFile;
// genconn 文档快照 → Arch/<design>.arch
export function archDocFile(design: string, text: string): OutFile;
```

映射规则示例:

- `ipFiles`:`name` 以 `.v` 结尾 → `IP/VERILOG/${basename(name)}`;`.icl` → `IP/ICL/...`;`.tcl` → `IP/TCL/...`。
- `archConnectionFiles`:`name` 以 `.top_level_ports_and_connectionss` 结尾 → `Arch/${base}.connection.tcl`(base = leaf 去该后缀);否则以 `.tcl` 结尾 → `Arch/${base}.feedthrough.tcl`。

## 4. genconn 文档与 `Arch/<design>.arch` 统一

用户明确:`Arch/${design}.arch` 就是 `chip_top.genconn.json` 换名。故**统一为一份文件**,不产生两份:

- 工程的 genconn 文档路径(P3b `DftProject.genconnDoc`)默认值从 `<base>.genconn.json` 改为 `Arch/<design>.arch`。
- 新建工程时 `genconnDoc = "Arch/<design>.arch"`(`<design>` 取自 filelist basename 去扩展)。
- P3b 的 `useProject.saveGenconn`(编辑保存/切换/关窗)写这个路径;打开工程时从这里载入。
- genconn「写入工程」按钮:写连接文件(§3 archConnectionFiles)+ 确保当前 genconn 文档已写到 `Arch/<design>.arch`(调 `saveGenconn(toText())`)。

约束:改动只动 `saveGenconn` 里 `genconnDoc` 为 null 时的默认路径 + 新建工程的初值。P3b 的 `saveGenconn` 已把 `genconnDoc` 相对 `.dftproj` 目录解析——因 §1 令 `.dftproj` 目录 = 树根,`Arch/<design>.arch` 自然落在树根的 `Arch/` 下,**无需改解析逻辑**,只改默认值。已有工程若 `genconnDoc` 已是旧值,保持不变(不迁移,避免破坏)。

## 5. 寄存器统计导出格式(`register_count.tcl`,可 source)

**下游程序要读它**——用户选定 **TCL 可 source 数组**(Tessent/TCL 流程 `source` 进来即得变量)。`src/hierarchy/core/regReport.ts` 纯函数 `formatRegReport(design, rc)` 产出:

```tcl
# register count — <design>
# fields: own / subtree / memory (per instance, keyed by full hier path)
set reg_count(<design>,total_flops) <rc.total>
set reg_count(<design>,total_memory) <总存储器位>
set reg_count(<inst hier>,own) <own>
set reg_count(<inst hier>,subtree) <subtree>
set reg_count(<inst hier>,memory) <memoryBits>
...
```

- 每个实例三条:`own` / `subtree` / `memory`,索引用**全层次路径**(如 `chip_top.u_cpu`),值为整数。
- 顶部两条汇总:`total_flops`(= `rc.total`)、`total_memory`(全设计存储器位总数)。
- 实例名含空格/特殊字符时,索引整体不 quote(全路径是合法 ident 段用 `.` 连接;若含特殊字符,实施时对索引加 `{}` 包裹以确保可 source)。
- 行序按 subtree 降序(复用 RegCountTab 的 `regRows`,和屏幕默认一致)。
- 存储器位来源:`memory` 列取每实例 `memoryBits`;`total_memory` 取根实例 subtree 的存储器位(实施时按 RegCount 数据结构确认字段;若无现成全量字段,则取全表 own memory 之和)。

## 6. pad 两段拆分

`padGen` 返回一整块 `genText`(read_config_data 段 + set_boundary_scan_port_options 段)。新增纯函数(放 `src/hierarchy/core/pad.ts`):

```ts
export function splitPadOutput(text: string): { auxiliary: string; bscanOptions: string };
```

规则:找到第一行以 `set_boundary_scan_port_options` 开头处;之前(trim)= `auxiliary`,从该行到末尾 = `bscanOptions`。若找不到该标记 → 全归 `auxiliary`,`bscanOptions` 为空串。

**PadTab 预览改双栏**:把底部单一 `<pre className="pad-gen">` 换成复用 `GenPreview`,传入两个文件 `[{name:"auxiliary.spec",text:aux},{name:"bscan_options.tcl",text:opts}]`(空段不传)。「导出…」保留(原生框单文件);新增「写入工程」写两文件到 `Spec/bscan/`。

## 7. UI 接线(每面板一个「写入工程」)

共用一个小助手 `writeToProject(files: OutFile[]): Promise<void>`(放 `src/store/project.ts`):

- 读 `useProject.getState().path`(`.dftproj` 绝对路径);无 → `window.alert("请先新建或打开工程")`,return。
- `baseDir = path 去掉末段文件名`(即 `.dftproj` 所在目录 = 树根 = outputDir)。
- 调 `window.dft.project.writeFiles(baseDir, files)`;成功 → 轻量成功提示(toast 或短暂状态,显示写入数量/根目录);失败 → `window.alert("写入失败：" + msg)`。

各面板按钮:

| 面板                                     | 按钮       | 写什么                                                           |
| ---------------------------------------- | ---------- | ---------------------------------------------------------------- |
| genconn`GeneratePanel`                 | 写入工程   | archConnectionFiles(files) + archDocFile(design, genconnDocText) |
| DFX`DfxCtrlTab`                        | 写入工程   | ipFiles(genFiles)                                                |
| specgen`Workspace`                     | 写入工程   | specFile(design, specText)                                       |
| pad`PadTab`                            | 写入工程   | padFiles(aux, bscanOpts)                                         |
| 寄存器`RegCountTab`                    | 导出到工程 | regCountFile(formatRegReport(...))                               |
| 注入(GeneratePanel 的"导出带 DFT 的 .v") | 增写入工程 | withDftPortFile(design, injected)                                |

现有「下载/全部下载/导出/复制」保留(离线/无工程时仍可用);「写入工程」是新增的、需工程的一键写盘。

## 8. 工程文件命名 + 新建工程落位

- 命名从 `${design}_plan.dftproj` 改为 `${design}.planner.dftproj`。
- **新建工程把 `.dftproj` 写进所选 `outputDir`**(而非单独再选保存位置):`dft:project:pickNew` 从"选 filelist + 选输出目录 + 选 .dftproj 保存位置"三对话框,简化为"选 filelist + 选工程/输出目录"两对话框,`.dftproj` 路径 = `<outputDir>/${design}.planner.dftproj`,`<design>` 取 filelist basename 去扩展。这样 `.dftproj`、`Arch/`、`Spec/` 等同根(§1)。
- 已存在工程不迁移。

## 9. 错误处理

- 无工程/无 outputDir:按钮提示"请先新建或打开工程",不写。
- 写盘失败(权限/磁盘):一次性 `alert`,不阻断 UI。
- 生成器本身未就绪(specgen 无 scope、pad 无 lib、genconn 无产物):按钮 disabled 或点击提示"暂无可写内容"。

## 10. 测试

- **单元(TDD)**:`outputLayout`(各映射函数的 relPath 正确、扩展名分流)、`regReport`(格式/合计)、`splitPadOutput`(有/无 set_boundary_scan 标记两种)。
- **e2e**:建工程(pickNew 走 e2e 桩或直接 setState 工程)→ 某面板点「写入工程」→ 断言 `dft:project:writeFiles` 被调、relPath 落在对应子目录。因涉及真实 filelist/生成,优先对**纯函数 + writeFiles IPC** 做集成测试(临时目录),UI 层做冒烟(按钮存在、无工程时提示)。
- 现有全量 unit/e2e 保持绿。

## 11. 主要触及文件

- 新建:`src/store/outputLayout.ts`、`src/hierarchy/core/regReport.ts`、单测三份。
- 修改:`electron/main.cjs`(writeFiles IPC + pickNew 命名)、`electron/preload.cjs`、`src/core-bridge/dft.d.ts`、`src/store/project.ts`(saveGenconn 默认路径 + writeToProject 助手 + genconnDoc 初值)、`src/hierarchy/core/pad.ts`(splitPadOutput)、各面板(`GeneratePanel.tsx`/`DfxCtrlTab.tsx`/`specgen/Workspace.tsx`/`PadTab.tsx`/`RegCountTab.tsx`)加「写入工程」按钮 + pad 预览双栏。

## 12. 非目标(Phase B / 另议)

- `.dftspec` 按 mbist/bscan/logic_test/scan/atpg 类别拆分。
- 独立 `.arch` 架构文件(区别于 genconn 文档)、`IP/PDL`。
- 一键"生成全部并写入工程"(本期只做各面板单独写)。
- 已有工程的路径迁移。

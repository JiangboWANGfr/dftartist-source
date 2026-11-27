# dft-suite UI 重设计（外观系统化 + 工程模型 + 统一组件）

- 日期：2026-07-10
- 状态：设计定稿，待实施
- 范围：dft-suite 的 UI / 交互 / 前端持久化。**不改**任何生成逻辑、层次解析、寄存器计数、pad 表格算法、DFX 图构建算法。
- 非目标：不引入组件库（继续手写 CSS，但把它系统化）；不重写 Konva/ELK 渲染管线；不改 dft-core 引擎。

## 0. 背景与动机

功能已收敛，现在做一次外观与交互的整体升级。用户提出的具体痛点：

1. 顶栏三个工作区 tab（层次浏览/连接生成/SpecGen）用大黑框按钮，太高、不专业。
2. 层次浏览左侧层次树宽度固定 320px，不能拖。
3. 寄存器统计 / Pad/BScan 按钮堆在树顶，功能一多就挤，缺一个可扩展的家。
4. GenConnection 工具条一排大按钮（新建/打开/保存/另存为…），不专业。
5. 重开软件后「连接生成」仍残留上一次的画布 —— genconn 存在 localStorage、与设计无关。
6. genconn 文件放哪、生成文件放哪、打开设计按钮放哪，没有统一答案。
7. SpecGen 没有 harden 时整页空白，只有一行灰字。
8. 「生成结果」面板只给新文件全文，看不出**改了什么**（DFX 注入尤其需要改动预览）。
9. DFX Ctrl 的数据与生成都耦合在 genconn 里，不该显示在「连接生成」。
10. DFX Ctrl 右侧「DFX 修改」面板窄、截断、层级乱，各工作区右侧面板样式各不相同。

## 1. 决策总览（8 项，均已确认）

| #  | 主题          | 决策                                                                                                                                       |
| -- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1 | 整体布局      | 紧凑顶栏：三个工作区改**下划线式细 tab**，顶栏 48→~38px；左侧树**可拖宽 + 可折叠**                                            |
| Q2 | 命令组织      | 工作区内**下拉菜单**收纳文件类命令；功能入口走中央 tab 栏「**+ ▾**」下拉；关键命令另注册 **Electron 原生菜单 + 快捷键** |
| Q3 | 文件与流程    | 显式**`.dftproj` 工程文件**；启动进**欢迎页**；genconn 画布绑定工程，**不再自动恢复 localStorage**                     |
| Q4 | SpecGen 空态  | 三栏照常显示、**IP 库置灰禁拖**；画布中央**三步引导卡**                                                                        |
| Q5 | 视觉风格      | **双主题保留可切换**：A 深邃工程风（默认深色）+ B 清爽亮色（浅色），两套都精修                                                       |
| Q6 | 生成预览      | 全app统一的**Diff 预览组件**（红删/绿增，新文件全绿，顶部文件列表带 新/改 标签与 ±统计）                                            |
| Q7 | DFX Ctrl 归属 | 搬进**层次浏览独立 tab**（与 Pad/BScan 同构）；genconn 生成结果**不再含 ctrl 文件**                                            |
| Q8 | 右侧面板      | 抽取**统一 Inspector 骨架**（标题栏 + 分区 + 字段行/列表行三种积木），genconn 实例 / DFX 修改 / pad 详情共用，宽度可拖               |

## 2. 设计系统地基（Q5）

现状 `src/theme/theme.css` 只有颜色 token 化，间距/圆角/字号/阴影全是散落硬编码。本次补齐 scale token，全app消费：

- **间距**：`--sp-1`…`--sp-6`（4/6/8/12/16/24px 量级，最终值实施时定）。
- **圆角**：`--r-sm/-md/-lg`。
- **字号**：`--fs-xs/-sm/-md/-lg` + 现有 `--mono` 栈。
- **阴影/层级**：`--sh-1/-2/-3`（面板、悬浮、弹窗三档）。
- **双主题**：沿用现有「`:root`=深、`html.light`=浅」的 class 切换机制。本次把两套都调到位：
  - **A 深色（默认）**：近黑底 `#101114`、发丝级边框 `#26282e`、单一蓝 accent `#4f8cff`、克制阴影与圆角。
  - **B 浅色**：`#f7f8fa` 底、柔和投影、accent `#2563eb`。
  - 切换按钮（`ThemeToggle`）保留，默认深色。

约束：新增 token 后，`shell.css` 和三个工作区 `styles.css` 中的硬编码 px 逐步改引用 token（只改动本次触及的规则，不做无关全量替换）。

## 3. 外壳 chrome（Q1 + Q2）

### 3.1 顶栏 `src/shell/TopBar.tsx` + `theme.css`

- 高度 48 → ~38px。
- 三个工作区 tab：大黑框按钮 → **下划线式**（active 底部 accent 线 + 文字加强，非 active 为 `--text-dim`）。
- 左：brand（logo + dft-suite）；中：三个工作区 tab；`spacer`；右：**打开工程/最近**入口 + `ThemeToggle`。
- 「打开设计」按钮语义并入 Q3 的工程流程（见 §5）。

### 3.2 原生菜单 + 快捷键（Electron 主进程 `electron/main.cjs`）

- 注册原生 `Menu`：文件（新建工程/打开工程/打开设计/保存/另存为）、编辑（撤销/重做）、视图（切换工作区/主题）、帮助。
- 快捷键 accelerator：⌘N/⌘O/⌘S/⇧⌘S、⌘Z/⇧⌘Z、⌘1/2/3 切工作区。
- 菜单项通过 IPC 触发渲染层已有的 store action（不新造逻辑，只是多一个触发入口）。UI 主路径仍是工作区内下拉。

### 3.3 状态栏 `src/shell/StatusBar.tsx`

- 保留四态（idle/opening/error/ready），重新配色对齐设计系统，文案随 §9 打磨。

## 4. 左侧栏与功能入口（Q1 + Q2）

### 4.1 层次树可调宽 `src/hierarchy/Workspace.tsx` + `styles.css`

- `.leftdock` 由 `flex: 0 0 320px` 改为**可拖拽 resizer + 可折叠**，宽度记忆到 localStorage（键 `hierarchy:leftW`），对齐 genconn/specgen 已有 resizer 模式。
- 折叠态：收成一条窄边，点击展开。

### 4.2 功能入口改「+ ▾」下拉

- 移除 `dock-head` 里的「寄存器统计」「Pad/BScan」按钮。
- 中央 `TabArea` 的 tab 栏右侧加「**+ ▾**」下拉，列出可打开的功能页：寄存器统计、Pad/BScan、**DFX Ctrl**（Q7 搬入后同列）、未来功能。
- 右键树节点的既有入口（如「Add to DFX Ctrl」）保留。

## 5. 工程与文件模型（Q3）★ 结构性改动

### 5.1 `.dftproj` 工程文件

- 新增显式工程文件 **`<name>_plan.dftproj`**（如 `chip_top_plan.dftproj`，JSON），记录：
  - `filelist`：设计 filelist 路径（可指向只读目录）。
  - `top`：top module。
  - `outputDir`：生成产物输出目录。
  - `genconnDoc` / `specgenWorkspace` / `padCfg`：各文档相对/绝对路径引用。
- **工程可放任意位置，不强制在设计目录旁**（设计目录常只读）。默认建议放在用户所选输出目录。

### 5.2 欢迎页（启动，无工程时）

- 列「最近工程」+ 三个动作：新建工程 / 打开工程 / 快速打开设计。
- **新建工程向导**：选 filelist + 选输出目录 → 写出 `.dftproj`。
- 「打开设计」快速入口：仅打开 filelist 浏览层次（不建工程），兼容轻量使用。

### 5.3 genconn 绑定工程（修「重开残留」）

- `src/genconn/store.ts` 的 `initialDoc()` **不再从 localStorage 自动 `lsLoad`**：
  - 无工程 → 空白 `emptyDocument`。
  - 有工程 → 载入 `工程.genconnDoc`。
- localStorage 仍可作为「未保存草稿」缓存，但**不作为启动自动恢复源**。
- 保存/另存写入工程记录的 genconn 文档路径。

### 5.4 生成产物落盘

- 「生成」结果统一写到 `工程.outputDir`（可保留「另存/下载」）。
- 与 Q6 统一预览组件协同：生成先出 Diff 预览，确认后「应用到磁盘」写入 outputDir。

## 6. SpecGen 空态（Q4）

`src/specgen/Workspace.tsx`：`scopes.length === 0` 时——

- 三栏结构照常渲染：左 IP 库**列出但置灰、禁拖**（hover 提示「先加入 harden」），右 spec 预览显示骨架。
- 画布中央**引导卡**，内容用三步流程：① 打开设计 → ② GenConnection 选 harden 加入 → ③ 回此摆 IP 生成；底部「去 GenConnection →」按钮（`setWorkspace("genconn")`）。

## 7. 统一生成/修改预览组件（Q6）

抽取共享组件 `<GenPreview>`（新建于 `src/common/`）：

- **顶部文件列表**：每项文件名 + `新`/`改` 标签 + `+N/−M` 统计。
- **主体**：
  - 改动文件 → unified diff，增行绿、删行红、±3 行上下文。
  - 新文件 → 全片按新增（绿）展示，带语法高亮。
- **动作条**：复制、下载、**应用到磁盘**（写入工程 outputDir）。
- **接入点**：genconn 生成结果、DFX ctrl 生成、pad 生成 全部改用该组件，替换各自现有的预览面板。
- diff 计算：优先由引擎/CLI 返回结构化改动；前端兜底用轻量 diff（对新文件无需 diff）。

## 8. DFX Ctrl 归属（Q7）

- **UI 迁移**：DFX Ctrl 作为「层次浏览」独立 tab（现已是 `dfxctrl` tab kind，`DfxCtrlTab`），与 Pad/BScan 同构；纳入 §4.2 的「+ ▾」下拉与右键入口。
- **生成解耦**：genconn 的「生成结果」**不再包含 ctrl 文件**；ctrl 的生成 + Diff 预览（§7）在 DFX tab 内独立完成。
- **数据归属但共享**：`dfxInstances + ctrlIps` 底层可继续存于共享 store（避免大改数据层），但**入口、生成、预览的 UI 家全部落在 DFX tab**。genconn 只读取自己需要的连线数据，不再暴露 DFX 生成 UI。
- DFX tab 的右侧面板改用 §9 的统一 Inspector 骨架。

## 9. 统一 Inspector 骨架（Q8）

抽取共享组件（建议 `src/common/Inspector`）：三种积木——

- **标题栏**：主名（过长省略号 + hover 全名）+ 右侧副信息（如「2 目标 · 1控/1观」）。
- **分区标题**（section header）。
- **字段行 / 列表行**：label + 值 / 名字 + 元信息 + 行内按钮（编辑/删除，不再藏）。
- **接入点**：genconn「实例」Inspector、DFX「修改」面板、pad 选中详情 全部重构到该骨架；宽度可拖（DFX 面板去掉固定 240px）。
- 配色、间距、圆角一律取设计系统 token（§2）。

## 10. 文案打磨（横切，Q 提及的"提示词"）

统一重写：各工作区空态、tooltip、状态栏提示、弹窗文案、按钮文字。统一术语（工程 / 设计 / harden / 生成 / DFX 修改），去除半键盘符号等瑕疵。集中在实施末期扫一遍。

## 11. 分期实施

| 期                          | 内容                                                                                                     | 风险                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------- |
| **P1 外观地基**       | §2 设计系统 · §3 顶栏/菜单/状态栏 · §4.1 可拖宽树 · §6 SpecGen 空态 · 工具条下拉化（Q2 UI 部分） | 低（不动数据）        |
| **P2 统一组件**       | §9 统一 Inspector · §7 统一 Diff 预览 · §4.2「+ ▾」功能下拉                                        | 中（重构现有面板）    |
| **P3 归属与工程模型** | §8 DFX Ctrl 迁移 + 生成解耦 · §5`.dftproj` + 欢迎页 + genconn 绑定                                  | 较高（结构 / 持久化） |
| **收尾**              | §10 文案打磨 · 回归测试                                                                                | 低                    |

每期一个实施计划（plan），可独立合并、独立见效。

## 12. 测试与验收

现有 e2e/unit 保持绿。新增覆盖：

- 树宽度拖拽后持久化、重开恢复（P1）。
- 顶栏原生快捷键触发对应 action（P1）。
- SpecGen 无 harden 时渲染引导卡 + 置灰 IP 库、禁拖（P1）。
- Inspector 骨架：三处面板结构一致、长名 tooltip、按钮可点（P2）。
- Diff 预览：改动文件出红/绿 diff、新文件全绿、±统计正确、「应用到磁盘」写入 outputDir（P2）。
- DFX Ctrl：genconn 生成结果不含 ctrl 文件、DFX tab 内可生成+预览（P3）。
- `.dftproj` 建/开往返；genconn 无工程时启动为空白（不恢复 localStorage）；有工程时载入其文档（P3）。

## 13. 主要触及文件（索引，非详尽）

- `src/theme/theme.css`（token + 双主题）
- `src/shell/TopBar.tsx` · `StatusBar.tsx` · `App.tsx` · `shell.css` · `OpenDesign.tsx`（→ 工程入口）
- `electron/main.cjs`（原生菜单 + `.dftproj` 读写 + outputDir 写盘）
- `src/hierarchy/Workspace.tsx` · `styles.css` · `TabArea.tsx`（可拖宽树、+▾ 下拉、DFX tab）
- `src/genconn/Toolbar.tsx` · `GeneratePanel.tsx` · `persist.ts` · `store.ts` · `lifecycle.ts`（工具条下拉、绑定工程、生成解耦）
- `src/specgen/Workspace.tsx`（空态）
- 新增：`src/common/GenPreview`（Diff 预览）· `src/common/Inspector`（统一面板）· 欢迎页组件
- `src/hierarchy/schematic/DfxCtrlTab.tsx`（右侧面板改用统一 Inspector）

# dft-suite 设计规格(spec)

> 把 **Hierarchyshower**(层次浏览)与 **newProject / GenConnection**(连接生成)两个 Electron UI 合并为
> **一个原生桌面软件**,统一以 **dft-core** C++ 引擎为后端。支持 **深色 / 浅色** 两套主题。
> (DRC 能力 drc-core 已就绪,作为**后续第三工作区**接入,本轮不做。)
>
> 日期:2026-06-29 · 状态:设计已认可,待落地 · 目标平台:Linux AppImage

---

## 1. 背景与目标

当前 DFT 工具链由三个独立仓库构成:

| 项目 | 角色 | 技术栈 |
|---|---|---|
| `dft-core` | C++20 后端内核(HDL 解析 / netlist / 连接生成 / 注入 / DRC) | C++20 + slang(已 vendored) |
| `Hierarchyshower` | 设计层次 **浏览器**(树 / 原理图 / 源码 / trace) | Electron 42 + Vite 8 + React 18.3 + Konva 10 + Zustand 5 + elkjs |
| `newProject`(GenConnection) | 连接 **编辑 / 生成器**(画布摆 harden + 总线接口 + 生成 Tcl + 注入网表) | Electron 42 + Vite 8 + React 18.3 + Konva 10 + Zustand 5 + zundo |

**关键事实:两个 UI 的技术栈逐版本完全一致**(Electron 42.3.3 / Vite 8 / React 18.3.1 / Konva 10.3 /
Zustand 5 / TS 6),且它们 **互补不重叠**,已经在用同一套 `DesignHierarchy` JSON schema、并通过
`*.blocks.json` 互通。因此合并是「难度最低的一种情况」。

**目标**:产出一个名为 `dft-suite` 的统一 Electron 桌面应用,具备**两大工作区**:

1. **层次浏览**(= Hierarchyshower)
2. **连接生成**(= GenConnection)

两个工作区 **共享一份「已打开的设计」与一个 dft-core 后端**,联动从「文件中转」升级为「进程内实时」;并提供 **深色 / 浅色** 两套主题。

> **DRC**(= drc-core)作为**后续第三工作区**接入,本轮不做。

### 非目标(本期不做)

- 本期不做 N-API 插件(近期通过「spawn daemon + shell CLI」接 dft-core);N-API 为**后续集成升级路径**,见下「技术栈决策」。
- 不做 macOS / Windows 打包(仅 Linux AppImage)。
- 不动 dft-core 的核心算法(已验证、字节级一致)。
- 不做 VHDL、不扩 DRC 规则(沿用 dft-core v1 规则集)。
- **本轮不做 DRC 工作区**(drc-core 能力已就绪,留作后续接入)。

### 技术栈决策:Electron/TS(非 Qt)

UI 用 **Electron + React + Konva + TS**,**不**重写为 Qt。理由:

- **复用**:两个 UI 已是同一套 TS 栈,合并几乎零重写;Qt 需把树 / 原理图 / 画布编辑器全部重做(月级)。
- **与 core 结合**:用 **N-API** 把 dft-core 链进 Node 进程(in-process,免序列化)即可达到"原生结合",无需 Qt。
- **健壮性**:daemon / N-API 边界让 slang 在客户脏 RTL 上崩溃时不拖垮 UI(EDA parser 真会崩)。
- **授权 / 人才**:全 MIT 栈零成本零约束;Qt 商业授权与稀缺 C++/GUI 人才是额外成本。
- **约束核对**:目标用户为工程师工作站,无超大场景渲染 / 无禁带 Chromium / 无小体积硬指标 → 未命中任何"该上 Qt"的触发条件。

**集成演进路径**:现在 spawn `hdl` daemon + shell `genconn` CLI(已验证)→ 后续 **N-API 同进程直链**
(性能 / 结合升级,**不动 UI、不改 core**)。Qt 仅在未来命中「超大渲染 / 禁带 Chromium / 极小体积 / 产品线统一」时再评估。

---

## 2. dft-core 能力盘点(后端"够不够")

| 库 | 能力 | 替代谁 | 状态 |
|---|---|---|---|
| **hdl-core** `libhdlcore` | slang 解析 → 层次/端口/netlist/驱动/trace;NDJSON daemon + `hdl` CLI | Hierarchyshower 的 Python daemon(同协议,**快 25×**) | 完成、已验证 |
| **genconn-core** `libgenconncore` | 接口展开 → 排序/校验 → 生成 Tessent/TCL | GenConnection 的 `src/core/`(**byte-identical**) | 生产就绪 |
| **inject-core** `libinjectcore` | slang 锚定的网表 DFT 注入 | GenConnection 的 `vinject` | 生产就绪 |
| **drc-core** `libdrccore` | 时钟/复位可控性 DRC(CLK-UNCTRL / RST-UNCTRL / CLK-GEN / CLK-GATED / CLK-AS-DATA) | **全新能力** | 规范完成、v1 |

**三种调用方式**:① NDJSON daemon(`hdl serve`,实时浏览)② CLI(`hdl` / `genconn` / `drc`,一次命令出 JSON)
③ 链接静态库。

**结论**:作为合并后 app 当前所有功能的后端 —— **够了**,且白送 DRC。瓶颈在 UI 合并 + 打包,不在 core。

---

## 3. 总体架构

```
                  ┌──────────── dft-suite (Electron) ────────────┐
   渲染层(React)  │  Shell: 顶栏 + 工作区Tab + 全局状态栏          │
                  │   ├─ 工作区1 层次浏览  (= Hierarchyshower)     │
                  │   └─ 工作区2 连接生成  (= GenConnection)       │
                  │      (工作区3 DRC = drc-core,后续接入)         │
                  └───────────────┬──────────────────────────────┘
                          window.dft (preload IPC)
   主进程(main.cjs) ┌───────────────┴──────────────────────────────┐
                  │  1× hdl daemon(常驻,实时浏览)                 │
                  │  shell genconn CLI(一次性命令)                │
                  │  resources/bin/ 内置 dft-core 二进制           │
                  └──────────────────────────────────────────────┘
```

**合并的核心价值 = 共享「已打开的设计」**。现在两个 app 各自开设计、各自起后端;合并后 **开一次设计
(一个 filelist → 一个 hdl daemon)**,两个工作区都读它,联动变进程内实时:

- 层次浏览右键「加入连接生成」→ 节点 **直接** 出现在连接生成画布(不再走 `*.blocks.json` 文件中转)。
- 连接生成的层次面板直接用同一个 daemon,**删掉** newProject 现在的 `/api/parse` 本地 server。

---

## 4. UI 界面布局 spec(本设计的重点)

> 可视化 mockup 见 `docs/mockups/*.png`(深色)与 `*-light.png`(浅色),合订
> `dft-suite-mockups-dark.pdf` / `dft-suite-mockups-light.pdf`。两套主题在壳层切换。

### 4.0 全局外壳(常驻)

```
┌──────────────────────────────────────────────────────────────────────┐
│ dft-suite   [ 层次浏览 ] [ 连接生成 ]               📂 打开设计 ▾  ⚙  │ ← 顶栏:工作区Tab + 全局动作
├──────────────────────────────────────────────────────────────────────┤
│                       « 当前工作区内容 »                                │
├──────────────────────────────────────────────────────────────────────┤
│ 设计: openc910  ·  实例 17,102  ·  ● daemon ready  ·  选中 ct_lsu_top   │ ← 全局状态栏(两区共享)
└──────────────────────────────────────────────────────────────────────┘
```

- **「打开设计」在壳层**(不在任何工作区里):选 filelist → 主进程起 **1 个** `hdl serve` daemon → 两区共用。
- 多顶层(multi-top)选择器也放壳层(上移自 HS 的 `App.tsx`)。
- 状态栏由共享 store 驱动:设计名 / 实例数 / daemon 状态 / 当前选中实例。

### 4.1 工作区「层次浏览」(原样搬 Hierarchyshower)

```
┌── 左:层次树 ─────┬─────────────── 中间区(Tab)──────────────────┐
│ 层次树 (lazy)     │ [端口] [原理图] [HDL源码] [trace]       ✕ ✕   │ ← TabArea.tsx
│  ▾ ct_top         │  端口表(点击实例后在中间区展示):            │
│   ▾ cpu_top       │    name / dir / width / type,可滚动         │
│     ◂ ct_lsu_top  │  原理图: Konva 方框+连线+pin菱形 (elkjs)      │
│       (选中)      │  HDL源码: 只读+行号高亮 · trace: fanin/out    │
└───────────────────┴────────────────────────────────────────────────┘
右键(ContextMenu.tsx):看原理图 / 看HDL定义·实例 / ★加入连接生成
```

- **端口不再放左侧 dock**;点击实例后,端口表在**中间区作为一个 Tab** 展示(name / dir / width / type)。左侧只剩层次树。
- 复用组件:`HierarchyTree` / `TabArea` / `HdlSourceTab` / `schematic/SchematicTab`;`DefinitionPanel`(端口表)从左侧 dock 移到中间区 Tab。
- 接线改动:数据来自共享 store 的 daemon(见 §5),不再自己开 daemon。
- 「★加入连接生成」从「导出 `blocks.json`」升级为「直接把块塞进工作区2画布」并自动切到工作区2。

### 4.2 工作区「连接生成」(原样搬 GenConnection)

```
┌─ Toolbar.tsx ──────────────────────────────────────────────────────┐
│ 例子 新建 打开 | 从层次树导入 | 导出注入.v | 显示/隐藏面板           │
├── 左 ───────┬──────────── 画布 CanvasView.tsx ──────────┬── 右 ─────┤
│ 层次面板     │  harden 矩形/正交多边形                    │ Inspector │
│ (共享设计,   │  总线接口贴边 + 自动几何配对               │ Library库 │
│  拖节点入画) │  拖拽/缩放/旋转/镜像/框选/父子嵌套预览     │ Generate  │
└─────────────┴───────────────────────────────────────────┴───────────┘
底部/生成面板:逐层生成 Tcl · 预览 · UNCONNECTED 列表 · 下载 · 导出注入.v
```

- 复用组件:`CanvasView` / `Inspector` / `LibraryPanel` / `HierarchyPanel` / `GeneratePanel` / `snap` / `layout`,Zustand+zundo 撤销保留。
- **右侧 Inspector** 显示选中实例身份(instanceName / def / type / color / pos·size)+ 其每个接口明细:
  busType、role(client/secondary)、edge·offset、width、powerDomain、signals 数、配对/ported/未连状态。
- 接线改动两处:① `HierarchyPanel` 的 RTL 解析从 `/api/parse` 改走共享 daemon;② `GeneratePanel`
  的「生成 / 注入」从渲染层 TS core 改为 **主进程 shell `genconn` CLI**(C++,字节级一致)。

### 4.3 主题:深色 / 浅色

壳层提供 **深色(默认)** 与 **浅色** 两套主题,一处切换全局生效(渲染层用 CSS 变量,SVG 取色同源)。
两套都按 EDA 工具风格设计,对应 mockups 的 `*.png`(深)与 `*-light.png`(浅)。

> **DRC 工作区**(接 drc-core)为**后续接入**,本轮不实现。形态预览:规则栏 + 违例表
> (rule / signal / instance / file:line)+ 详情,点违例可跳回层次浏览定位实例 / 源码。

---

## 5. 前端→后端统一调用层 `window.dft`

把 HS 的 `window.hs` + GenConnection 的 `hierarchyApi` 合并成一个 `window.dft`(preload 暴露),三类调用:

| 命名空间 | 方法(示例) | 走哪条后端通道 |
|---|---|---|
| `dft.design` | `open / expandChildren / getPorts / traceFanin / traceFanout / sourceLocation` | 常驻 `hdl serve` daemon(NDJSON over stdio) |
| `dft.genconn` | `generateAll(doc) / inject(doc, v)` | 主进程 `spawn('genconn', …)`(一次性 CLI) |
| `dft.drc` *(后续)* | `check()` | 主进程 `spawn('drc', …)`(一次性 CLI) |

- daemon 客户端搬自 Hierarchyshower 的 `electron/daemon.cjs`(`DaemonClient`,NDJSON 请求按 id 关联)。
- CLI 封装为新文件 `electron/cli.cjs`。

---

## 6. 目录结构 `dft-suite/`

```
dft-suite/
  package.json            # 依赖并集: react react-dom react-konva konva zustand zundo elkjs
  vite.config.ts  tsconfig.json  index.html
  electron-builder.yml    # 复用 newProject 的, 加 extraResources 内置二进制
  electron/
    main.cjs              # 统一主进程: 管 1 个 daemon + shell genconn CLI
    preload.cjs           # 暴露 window.dft
    daemon.cjs            # DaemonClient (搬自 Hierarchyshower)
    cli.cjs               # genconn 调用封装 (新)
  resources/bin/          # 内置 dft-core 二进制: hdl genconn (Linux x64; drc 后续)
  src/
    shell/                # 顶栏 + Tab + 状态栏 + 打开设计 + 全局快捷键协调
    store/design.ts       # 共享 store: 打开的设计 / daemon 句柄 / 当前选中
    hierarchy/            # = Hierarchyshower 的 src/ui + src/core(降级为工作区)
    genconn/              # = newProject 的 src/ui + src/core(降级为工作区)
    drc/                  # DRC 工作区(后续接入)
    core-bridge/          # window.dft 客户端 + 共享 DesignHierarchy schema
    theme/                # 深/浅主题(CSS 变量 + 切换)
```

---

## 7. 后端接入 dft-core

- 开设计 → 主进程 `spawn('hdl', ['serve', filelist])`,一个常驻 daemon,两区共用;关/换设计时
  kill + 重起(沿用 HS 的 daemon 生命周期)。
- 生成 / 注入 → 主进程一次性 `spawn('genconn', …)` 出 JSON / Tcl / 注入网表。(DRC `spawn('drc', …)` 后续)
- 二进制定位:dev 指向 `../dft-core/build/`;打包用 `process.resourcesPath/bin/`。

---

## 8. 打包(Linux AppImage)

- 复用 newProject 的 `electron-builder.yml`,加
  `extraResources: [{ from: resources/bin, to: bin }]` 把 `hdl / genconn` 塞进 AppImage(`drc` 后续)。
- `build:desktop` = `vite build` + `electron-builder --linux AppImage`。
- ⚠️ **关键注意**:dft-core 二进制须为 **Linux x64** 原生编译(slang 已 vendored,自包含),
  而当前在 **macOS 开发**。dev 模式可指本地 mac 产物联调,但出 AppImage 必须在 Linux 机器 / 容器里
  编 dft-core。**这是落地时唯一需要额外环境的点。**

---

## 9. 迁移步骤(后续 implementation plan)

1. 搭壳:`shell/` + 共享 `store/design.ts` + `core-bridge/` + `theme/`(深/浅)。
2. 搬 `hierarchy/`、`genconn/`:各自 `App.tsx` 顶层壳拆成「工作区」组件,局部 store 保留;
   层次浏览端口表从左侧 dock 移到中间区 Tab。
3. 接线:`window.hs` + `hierarchyApi` → `window.dft`;genconn 生成改 CLI;删 `/api/parse` server。
4. electron-builder 内置二进制 + 出 AppImage。
5.(后续)新增 `drc/` 工作区。

---

## 10. 风险与注意

1. **Linux 二进制**:在 mac 开发,但打包要 Linux dft-core 二进制 → 需 Linux 构建环境 / 容器。
2. **快捷键 / 右键菜单冲突**:两套快捷键要按「当前激活工作区」隔离绑定,只有激活的工作区才绑自己的键。
3. **localStorage 命名空间**:genconn 用了 localStorage 自动保存,合并后命名空间要隔离,避免与壳层/其它工作区串扰。

---

## 11. 验收标准

- [ ] 单窗口**两工作区**可 Tab 切换,共享一份打开的设计;**深 / 浅主题**可一处切换全局生效。
- [ ] 层次浏览:左侧仅层次树;**点击实例后端口在中间区 Tab 展示**;原理图 / 源码 / trace 走 dft-core daemon。
- [ ] 连接生成:画布编辑 + **右侧实例/接口明细** + 「生成 Tcl」「注入 .v」走 dft-core `genconn` CLI,输出与现有 TS 版一致。
- [ ] 层次浏览「加入连接生成」进程内联动(不落 `blocks.json`)。
- [ ] `npm run build:desktop` 产出可运行的 Linux AppImage,内置 dft-core 二进制。

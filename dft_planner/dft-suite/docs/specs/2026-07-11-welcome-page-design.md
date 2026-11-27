# dft-suite 启动欢迎页(Welcome Landing)设计

- 日期：2026-07-11
- 状态：设计定稿，待实施
- 范围：纯前端。新增一个落地页组件 + App 一个路由分支 + 顶栏 idle 隐藏 tab。复用已建的 `useProject`(P3b) 与 `useDesign`。
- 关联：`docs/specs/2026-07-10-ui-redesign-design.md` §5.2(本篇是它的落地版；§5.2 的完整欢迎页此前被 P3b 以顶栏「工程▾」临时替代，现补齐真正的落地页）。

## 0. 背景

P3b 已实现 `.dftproj` 工程模型 + `useProject` store（新建/打开/最近/快速打开设计），入口临时挂在顶栏「工程▾」下拉。本篇补上冷启动时的**落地页**：无设计打开时给一个像样的、IDE 式的欢迎界面承载这些动作，而不是空白工作区。

## 1. 显示时机（冷启动才拦，非硬拦截）

- **显示条件**：`useDesign.status === "idle"`（没有打开任何设计）。无工程时必然 idle，故此单一条件即可。
- **消失**：新建/打开工程或「快速打开设计」→ `status` 变为 `opening/ready` → 欢迎页消失，进主界面。
- **返回**：关闭设计回到 `idle` → 再次显示。
- 不是硬拦截：打开任何东西即离开；不阻断已有的直接开设计路径（e2e 走 `__dftStore.openDesign` 自动跳过）。
- `opening`/`error`/`ready` 三态均不显示欢迎页（交由工作区各自处理其打开中/错误态）。

## 2. 架构与组件

- 新增 `src/shell/WelcomePage.tsx`：展示型 + 调 store action，无自有业务逻辑。
- 修改 `src/shell/App.tsx`：body 分支
  ```
  status === "idle" ? <WelcomePage /> : <WorkspaceBody ws={ws} />
  ```
  顶栏（`TopBar`）+ 状态栏（`StatusBar`）照常渲染。顶栏「工程▾」是常驻入口，欢迎页是冷启动大入口，二者互补、不冲突。
- 修改 `src/shell/TopBar.tsx`：三个工作区 tab 在 `status === "idle"` 时**隐藏**（避免"可点但无反应"的空档），一旦有设计打开即恢复。
- 数据：`WelcomePage` 挂载时 `useProject.getState().loadRecent()` 拉最近工程；读 `useProject(s => s.recent)`。

## 3. 布局（两栏式）

外层：`.welcome`（占满 body，居中内容块最大宽度约 720px）。

- **左栏**（`flex: 0 0 300px`，右边框分隔）：
  - 品牌：logo 方块 + `dft-suite` 大标题 + 副标题「DFT 连接 · SpecGen · Pad/BScan」。
  - 三个动作（竖排，复用 `.tbtn`/新 `.wl-action` 样式，走设计 token）：
    1. **新建工程**（主按钮，蓝）→ `useProject.getState().newProject()`，副文案「选 filelist + 输出目录」。
    2. **打开工程**→ `useProject.getState().openProject()`，副文案「.dftproj」。
    3. **快速打开设计**→ `window.dft.design.pickFilelist()` 成功后 `useDesign.getState().openDesign({ filelist })`（不建工程），副文案「只浏览层次，不建工程」。
- **右栏**（`flex: 1`）：
  - 小标题「最近工程」。
  - 列表：每项 = 工程名（basename 去 `.dftproj`）+ 完整路径（省略号截断，`title` 全路径），点击 = `useProject.getState().openRecent(path)`。
  - **空态**：`recent.length === 0` 时显示「还没有工程，点『新建工程』开始」。
- **窄窗**（`max-width: 640px`）：两栏降级为单列上下堆叠（左栏在上、最近在下），媒体查询处理。
- 配色/间距/圆角/阴影一律取设计系统 token；深浅主题自适应。

## 4. 组件接口

`WelcomePage` 无 props（连接型，从 store 取一切）：
- 依赖读：`useProject(s => s.recent)`。
- 依赖动作：`useProject.getState().{ loadRecent, newProject, openProject, openRecent }`、`useDesign.getState().openDesign`、`window.dft?.design?.pickFilelist`。
- 副作用：`useEffect(() => { void useProject.getState().loadRecent(); }, [])`。

## 5. 错误处理

- 新建/打开/最近的错误处理已在 `useProject`（P3b 终审已加 try/catch + alert）内完成；WelcomePage 只需 `void` 调用，不重复兜底。
- 快速打开设计：`pickFilelist` 返回 null（用户取消）→ 不动作；`openDesign` 失败由 `useDesign` 置 `status:"error"`（此时欢迎页消失、工作区显示错误态）。

## 6. 测试

- **单元**：WelcomePage 是纯展示 + store 调用，无纯逻辑可单测；靠 e2e + typecheck。
- **新增 e2e**（`tests/e2e/welcome.spec.ts` 或并入 `shell.spec.ts`，不需 hdl 二进制）：
  - 冷启动（不开设计）→ 欢迎页可见（`[data-welcome]`）、三个动作按钮在（`[data-wl="new"|"open"|"quick"]`）、最近工程区在。
  - 打开设计后欢迎页消失、工作区可见。
- **更新受影响的现有 e2e**（idle 状态直接操作工作区的少数几个——改成先打开设计再操作）：
  - `shell.spec.ts` 的「tab switch changes workspace」：先 `__dftStore.openDesign(FILELIST)`（需 hdl 二进制则加 `test.skip` 守卫）再点 tab；或改为断言 idle 显示欢迎页。
  - `appearance.spec.ts` 的「SpecGen 空态」「genconn 文件▾ 下拉」：这两个在 idle 直接切 tab 操作空态——改为先打开设计（`__dftStore.openDesign`）再切到对应工作区。注意：SpecGen 空态（无 harden 的引导卡）与 App 级欢迎页是两层，需先离开 idle 才能看到工作区级空态。
  - `appearance.spec.ts` 的「重开残留」测试：其点 genconn tab 前也需先离开 idle（打开设计）或直接在 evaluate 里操作 `__gcStore` 不依赖可见工作区。
  - 逐个跑 `npx playwright test` 收敛，凡因 idle→欢迎页导致的 workspace 不可见失败，按上法先开设计。
- 顶栏 tab 隐藏 + 欢迎页令全 app 首屏视觉变化 → `shell-*.png` 及相关全窗截图用 `--update-snapshots=all` 重生成。

## 7. 分期实施（单计划，约 3 任务）

1. `WelcomePage.tsx` 组件 + `welcome` CSS（两栏 + 空态 + 窄窗降级）。
2. `App.tsx` 路由分支（idle→欢迎页）+ `TopBar.tsx` idle 隐藏 tab。
3. 更新受影响 e2e + 新增欢迎页 e2e + 重生成截图。

## 8. 非目标

- 不做工程管理面板（重命名/删除最近项/固定）——YAGNI，后续再说。
- 不改 `useProject`/`.dftproj` 逻辑（P3b 已定）。
- 不改「生成→outputDir 写盘」（另议）。

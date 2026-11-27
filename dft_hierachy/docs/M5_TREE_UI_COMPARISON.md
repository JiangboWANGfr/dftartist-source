# M5-A-02b-01：树 UI 浏览器对照

日期：2026-10-15。A 本人执行；不是 B 冻结或 C 验收。
前置：C-75 已由 C 关闭，B 复验原样吸收为 903e814/2ca1086。
实现入口：[独立实验包](../web/experiments/m5-tree-ui/README.md)；
下一生产单元的唯一契约提案：[DESIGN §6.7](DESIGN.md#67-m5-树视图契约提案2026-10-15待-c-审查--b-冻结)。

## 结论与范围

保留既定 TreeModel + TanStack Virtual 路线。两种有限适配都完成了受控远端分页，
本次浏览器 6 场景 × 2 路线 = **12/12 通过**；没有证据说 Arborist 不能懒加载。
两者的 DOM 行数一样有界；区别是 Arborist 还需要把 L6 的可见扁平行表转换为嵌套数据，
同步库内开合/选择，并在更新时重新创建 NodeApi。Virtual 直接消费扁平行表，
键盘、焦点、ARIA、状态页和错误展示则需要自己实现。保留路线基于这项集成成本差异，
不是基于已有代码的投入，也不是声称 Virtual 在所有树场景更快。

本轮只交实验和具体待审声明，不将实验直接发布为生产 L7。
原型的两个渲染函数、共享展示逻辑和宿主都在一个有限 app.jsx 中，便于比较；
未来生产实现必须按受审职责组织，不能复制这整个实验包到 views。

## 来源与实际采用

npm 版本/完整性固定在实验自己的 package-lock；生产 web/package-lock 没有变化。
Arborist 3.16.0 的 npm gitHead 为 `d74c4ec696ba98c1a4e981075f6d60cdff3e290b`，
本轮核对以下五份 npm src 与只读 ref 对应字节完全一致。
registry 查询已有 Arborist 4.0.1；为复核 D 的固定参考，本次不扩展比较到 4.x。

| 固定来源 / 许可                                      | 精确入口                                                                                           | 本项目落点 / 采用方式                                              | 节省的工作及仍需适配                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| TanStack Virtual 3.14.19 / MIT                       | `@tanstack/react-virtual/src/index.tsx`；virtual-core 的 range/scroll 实现                         | `VirtualTree` / 实验直接依赖；生产候选沿既定路线                   | 使用窗口、测量、滚动与 rangeExtractor；仍自写键盘、焦点和 ARIA                              |
| Arborist 3.16.0 / MIT                                | `src/components/default-container.tsx`                                                             | `ArboristTree` / 实验直接依赖；生产借鉴交互规则                    | 原生复用方向/Home/End 和滚动；Enter/Space 必须捕获适配实例选择、scope 和页动作              |
| 同上                                                 | `src/components/default-row.tsx`、`row-container.tsx`                                              | `renderRow` / 使用扩展点，未复制源码                               | 复用虚拟行和原生行焦点；补充 posinset/setsize，去掉 leaf 的 expanded 和 scope 的 selected   |
| 同上                                                 | `src/interfaces/tree-api.ts`                                                                       | `api.open/close/setSelection/focus` / 实验使用，生产不采用库内状态 | 通过同步保护避免回调反向修改模型；选择不跟随焦点；没有复制远端缓存                          |
| 同上                                                 | `src/data/create-root.ts`、`create-list.ts`                                                        | 嵌套 data 投影 / 实验比较，生产不采用                              | 每次有效 props/open-state 更新遍历投影并重建 NodeApi/可见表；仅交可见投影，不复制隐藏模型树 |
| HAL `acc899e297ed3866ad7da432ab0403c3d8d62d1c` / MIT | `plugins/gui/include/gui/selection_relay/selection_relay.h:129`；对应 cpp 的 relaySelectionChanged | 实验 App 的共享 SelectionModel、origin 和宿主导航 / 思想借鉴       | 一个语义选择源、明确发送来源；不复制 Qt、全局单例、sender 裸指针或撤销业务                  |

React/ReactDOM 18.3.1、React 类型、esbuild 0.25.11、Prettier 3.9.10 为 MIT；
Playwright 1.64.1 为 Apache-2.0；全部只在独立实验 devDependencies 中。
React 18.3.1 是与固定参考兼容的实验基线，不表示锁定最终 Studio 的 React 版本。
没有新增生产依赖；未来生产安装需按 C 审过的 peer 范围和锁文件另交付。

官方资料核对：Virtual 的 React adapter 和核心滚动/窗口 API 见
[React Virtual 文档](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)、
[Virtualizer 文档](https://tanstack.com/virtual/latest/docs/api/virtualizer)。
稳定外部 store 订阅参照 [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)。
焦点与选择分离、树按键及动态树属性核对
[WAI-ARIA Tree View Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)。
这些资料用于设计核对，下面数字全部来自本地实际浏览器运行。

## 同模型、同场景与实际结果

每条路线使用新建的同一生产类和相同 fixture，避免相互缓存/操作干扰。
`公开 Transport → 真 HierClient → 真 TreeModel / SelectionModel → React → Chromium`。
不 monkey-patch 产品或第三方运行时；只用库公开 accessor 记调用数。
Transport 的暂停、错误和晚回复是实验驱动，不能代替真实 Core 或 IPC 验收。

| 场景（每路线一次）      | 实际检查                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| paging-scopes-reveal    | 每页2实例；跨页 scope ID 保持；第三页目标 reveal；定位不改选择；scope 折叠/隐藏/恢复不丢意图；未完成 owner 页的 scope 内 setsize=-1      |
| keyboard-selection-aria | Right/Down/Home/End/Enter；焦点移动不改选择；外部端口选择保留原 ref 并高亮 owner；外部按钮保持 DOM 焦点；叶/作用域属性；祖先折叠焦点回退 |
| cancel-retry-remount    | pending 折叠；迟到回复不提交；取消后显式重试；失败显示和成功重试；卸载期间宿主页继续，重挂看到成功前缀                                   |
| old-session             | 原模型 pending 时替换/释放；旧 Transport 晚回复不能改变新模型/挂载                                                                       |
| wide                    | 5,000 个子实例、五页；第一/第二页追加；End 到最后行；实际 DOM 有界                                                                       |
| deep                    | 120 层逐级异步展开；End 到最深行；根折叠仍保留已装载数据，DOM 归1行                                                                      |

浏览器监听 pageerror（含未处理拒绝）为空；无 skip/xfail。两路线外部按钮保持焦点。
完整逐场景结果/ARIA 属性见[原始结果](evidence/m5-tree-ui/results.json)。
截图已实际查看：小树两路线行内容/层次一致，宽树可滚至最后行，焦点有可见边框：
[Virtual 小树](evidence/m5-tree-ui/virtual-small.png)、[Arborist 小树](evidence/m5-tree-ui/arborist-small.png)、
[Virtual 宽树](evidence/m5-tree-ui/virtual-wide.png)、[Arborist 宽树](evidence/m5-tree-ui/arborist-wide.png)。

### DOM 与工作量

macOS 25.0.0 arm64 / Node24.21.0 / Chromium156.0.8078.4；viewport1000×850，
树高度336、固定行高28、两侧overscan2。以下为本轮一次固定运行，不给出统计置信区间。

| 观察点             | 已提交实例 |       可见模型行 | Virtual DOM | Arborist DOM |
| ------------------ | ---------: | ---------------: | ----------: | -----------: |
| 宽树首1000个子实例 |       1001 | 1002（含继续页） |          14 |           14 |
| 追加到2000个子实例 |       2001 |             2002 |          14 |           14 |
| 加载完整并End      |       5001 |             5001 |          14 |           14 |
| 深树120层          |        121 |              121 |          14 |           14 |
| 深树根折叠         |        121 |                1 |           1 |            1 |

已提交实例计数来自模型通知中实际出现的 instance refs 的去重观测；本实验同模型内不 reload，
折叠不会清已加载数据，reset 创建新模型和新计数。不是把晚到 wire 数据算成已提交。
结果另保留 deliveredInstances，以区分 Transport 收到与模型提交两个概念。

| 计数窗口                   | 两路线各自 ARIA 输入访问 | Virtual 嵌套投影访问 | Arborist 嵌套投影访问 | Arborist id / children accessor 各自次数 |
| -------------------------- | -----------------------: | -------------------: | --------------------: | ---------------------------------------: |
| 宽树首1000页，从操作前清零 |                     1004 |                    0 |                  1004 |                                     1006 |
| 追加第二页，从操作前清零   |                     3004 |                    0 |                  3004 |                                     3004 |
| 深树从挂载到120层          |                    14761 |                    0 |                 14761 |                                    22266 |
| 深树折叠，从操作前清零     |                        1 |                    0 |                     1 |                                        3 |

ARIA 数是 metadata 第一轮输入访问，不包含其 Map/组遍历的全部操作；两路线相同。
投影数是构造 Arborist data 时的逐行访问；库 accessor 数是公开回调实际调用数，
不是把每次调用都算作 NodeApi 分配。`TreeApi.update → createRoot/createList` 的重建行为
由固定源码确认；挂载、open state 同步和 pending/settled 均可能触发额外遍历。
没有量出 Virtual 内部全量工作、GC、峰值内存、Core 投影成本或递归最大深度，
因此不能用这些局部计数推出运行时间比例。120 层通过也不证明任意深度安全。
当前适配器未做完整 memo 优化；改进回调稳定性可能减少 Arborist 部分重建，但不能消除数据更新的嵌套投影。

## 后续契约与验证边界

DESIGN §6.7 提交 props、借用模型生命周期、宿主唯一导航协调者、选择/焦点/键盘、
状态页动作、命令错误与回调、虚拟化属性和独立测试清单。9 个类型负例验证提案静态边界。
实验未实现/验证所有新提案：通用 props 校验、多个实例 DOM ID 隔离、外部多项/定义选择、
初次入树优先已选行、reveal 自动滚动、Tab/Up/Left 全矩阵、StrictMode、回调异常和完整辅助技术行为。
这些是真实剩余验收项，不以本次 12 绿例代替。实验状态页错误文本尚非完整生产 code/message 展示。
UI 契约审查和 B 独立冻结后，再实现 `@hier/views` 生产组件；Electron 契约/演示壳仍属后续单元。

## 执行记录

命令在 repo 或标明实验/web目录执行；机器原输出及环境失败见本轮归档。

| 命令                                                                            | 结果                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 实验 `npm install --registry=https://registry.npmjs.org`                        | 官方源 ECONNREFUSED；主动停止，退出-15；未生成成功安装结果 |
| 安装尚未完成时的 `npm run build`                                                | 退出1，依赖缺失；编排提前，未修改产品规避                  |
| 实验 `npm install --registry=https://registry.npmmirror.com --fetch-retries=0`  | 退出0，固定32个依赖安装；锁完整性保留                      |
| 初次实验 `npm test`                                                             | 退出1，缺Playwright指定Chromium1248；不是语义断言失败      |
| 实验 `npx --no-install playwright install chromium`                             | 退出0，安装固定浏览器                                      |
| 实验 `npm test`（最终源码）                                                     | 退出0，构建和12/12浏览器场景，4.976秒；零pageerror         |
| 实验 `npm run format:check`                                                     | 退出0，Prettier3.9.10全部实验代码通过；没有冒称全仓ESLint  |
| web `node node_modules/typescript/bin/tsc -p contracts/tsconfig.tree-view.json` | 退出0，正消费者及9个精确预期错误                           |

另外实际执行 `HIER_SCHEMA_PYTHON=<venv> JOBS=2 caffeinate -i ./check.sh`，退出0，329.917秒；
三配置Core 75/75、78/78、80/80，前端标准批次27/258/3/241/6/19/287/8全部通过。
本轮三增量build.log零warning，不称fresh构建。`HIER_BIN=<本树>/core/build/hier npm run test:independent`
退出0，800/800；`npm run test:schema`退出0，655/655及27参数归一化。
完整证据见[机器归档](m5_tree_ui_a_verification.json)和[执行计划](plans/M5-tree-ui-comparison.md)。
512个原有受保护文件与2ca1086保持相同，B复验证据SHA保持；旧测试没有放宽。无API/IPC/Schema/ABI/工程格式变更；首版无持久化，
旧工程加载/迁移不适用。未运行真实大设计、Electron、旧dft-suite、Linux、远端CI或M7。

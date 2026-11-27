# Agent B：受审C-76修订后的树UI验收矩阵

## 状态与版本

固定b753daa6222ba942d900d38368dde67730dbde26，DESIGN SHA
163ae6caf3eb6698c2d72e5af9eb9cc492a4f957bac9d58a2b8d10c78dfbb3ad。
C-M5-TREE-VIEW-C76-CONTRACT-01已正式通过并关闭C-76；B确认Q01/Q02/Q03规范歧义解决。
这是旧[95条准备矩阵](M5_B_TREE_VIEW_ACCEPTANCE.md)的明确后继；旧文件/快照/报告不改写。

**95条仍是验收条件，不是95项已实现自动化。**
本轮只冻结C-76初始加载、来源id和统一反馈专项24项可执行浏览器用例；
完整UI测试集合及生产UI验收未完成。专项实际基线因生产缺出口而止于能力门禁，24语义用例未执行。
[本轮专项报告](M5_B_TREE_VIEW_C76.md)与[测试入口](../web/tests/independent-tree-view/c76/README.md)分别记录实际执行和未执行。
表中“预期”是从受审规范定义，不以A原型或其自测输出为依据。

## 输入、预期、依据与层次

### 输入、绑定与静态边界

执行层次：React单元 / 类型。规范依据：DESIGN §6.7.1，错误/初始加载以本次§6.7.1/.3修订为准。

| ID  | 输入/动作                                                             | 预期结果                                                                               |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| U01 | 同快照的有效tree/selection，ariaLabel=Hierarchy，height=280，其余省略 | 渲染；rowHeight默认28、overscan默认每侧2；不更改或dispose借用模型                      |
| U02 | height/rowHeight=0.5；overscan=0及-0；空className                     | 正数和非负整数按原值接受，不强转；水平宽度随容器                                       |
| U03 | height逐项0/-1/NaN/±Infinity/文本/null/对象                           | render同步TypeError；无新订阅、无模型命令，交宿主error boundary                        |
| U04 | rowHeight逐项0/-1/NaN/±Infinity/文本/null/对象                        | 同U03；不从错误尺寸产生窗口查询或模型状态变化                                          |
| U05 | overscan逐项-1/0.5/NaN/±Infinity/文本/null/对象                       | 同U03；不把非整数四舍五入或把负数截零                                                  |
| U06 | ariaLabel逐项空串/空格加制表换行/number/null                          | 同步TypeError；合法非空白标签原样用于可访问名称                                        |
| U07 | rowHeight/overscan显式undefined，分别及一起传入JS运行时               | 同省略，使用28/2；TS的exactOptionalPropertyTypes另拒绝这类静态输入                     |
| U08 | tree已dispose，其他props有效                                          | render同步TypeError；不订阅或执行任何命令                                              |
| U09 | selection已dispose，其他props有效                                     | 同U08，不让视图复活借用模型                                                            |
| U10 | 无snapshotId的SelectionModel配有效tree                                | 同步TypeError；不自动绑定或复制选择状态                                                |
| U11 | tree与selection属于不同snapshotId                                     | 同步TypeError；不选择相似ref、不重建模型                                               |
| U12 | 多项非法props同时出现                                                 | 只要求TypeError且没有订阅/命令；不冻结未规范的验证顺序或错误文案                       |
| U13 | 只读props；冻结的props容器；可用的原模型                              | 不修改props或冻结/释放模型；模型仍可被宿主正常操作                                     |
| U14 | className/回调传错JS类型；回调省略                                    | 非法props按同步TypeError处理；合法可选值不改模型所有权                                 |
| T01 | 独立view-types.ts合法消费者及逐项V01–V46                              | strict/exactOptionalPropertyTypes下正例0诊断，移除每个指令时真实负诊断；当前已实际执行 |
| T02 | 同一消费者绑定实际@hier/views生产出口                                 | 不得回退提案/fake导出；缺出口单列能力缺失，不能声称生产消费者通过                      |

### 行、查询和状态

执行层次：React集成：真实SDK/L6 + 公开可控Transport。规范依据：DESIGN §6.7.1–3 / 6.6，错误/初始加载以本次§6.7.1/.3修订为准。

| ID  | 输入/动作                                                         | 预期结果                                                                                    |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| I01 | SDK已ready、树尚未装载，挂载/普通重渲染                           | 不发roots/children/object/ancestors；挂载不是隐式loadRoots                                  |
| I02 | 初始rootState=idle且rows含roots status；click/Enter/Space逐项激活 | 保留真实行并显示加载层次；每次仅loadRoots一次；挂载/StrictMode零查询，不用独立无行按钮      |
| I03 | 宿主loadRoots取得complete空结果                                   | 显示无顶层实例；不伪造行、不自动重试、选择不变                                              |
| I04 | 根查询失败后激活同一status重试                                    | 稳定code/message可见，调用loadRoots一次；反馈保留原错误，rowId为启动roots status.id而非null |
| I05 | 根任务取消后激活重试动作                                          | 明确取消及重试标签，调用loadRoots；不称成功空列表                                           |
| I06 | 同一实例连续普通选择，含已相同origin=tree的选择                   | 每次输入按单项origin=tree规范；完全重复不另建历史，保留§6.5规则                             |
| I07 | 点击实例行；实例ref及snapshotId均有相似邻居                       | 只以该instance.ref替换为一个选择项，不根据name/pathText猜ref                                |
| I08 | 对聚焦实例按Enter及Space                                          | 各产生规范单项选择；不是展开、下翻页或全局键盘选择                                          |
| I09 | 点击实例展开控件                                                  | 只转发setExpanded目标状态，不顺带写Selection/history                                        |
| I10 | 点击scope/按Enter/Space                                           | 只开合scope；不伪造ObjectRef，不向Core请求scope路径                                         |
| I11 | pending页状态行激活，另有同SDK独立消费者                          | 调用cancel(owner)；不关SDK或取消其他消费者；原L6共享取消边界保持                            |
| I12 | 实例success有next，激活后续页                                     | loadMore(owner)使用原opaque cursor；成功前缀保留，无UI自己的游标/偏移                       |
| I13 | 后续页失败，激活重试                                              | 稳定错误与已成功前缀均保留；重试上一未提交cursor，不重取第一页                              |
| I14 | 后续页取消，激活重试                                              | 保留成功前缀和待取cursor；loadMore(owner)，不清空旧行                                       |
| I15 | roots/children/status/scope混合，实例同名、数组和escaped名字      | 严格按TreeModel.rows顺序/depth；标签取name或scope.label，不split路径文本                    |
| I16 | 跨页出现同scope前缀及同标签不同scope                              | 使用发布的RowId/parentId，合并/分组只由L6决定，无第二棵展开图                               |
| I17 | 宿主setShowGenerateScopes(false→true)，包含已展开子树             | 重投影和稳定身份以L6为准；UI无额外查询、无选择历史写入                                      |
| I18 | 协议错误/非法partial经真实SDK拒绝                                 | 页面显示L6稳定错误、旧前缀不丢；不在L7伪装partial成功或吞Core错误                           |
| I19 | 标签含点、反斜杠、数组括号、Unicode及HTML样文本                   | 原字符串显示并关联正确ref；无路径重解析或HTML执行                                           |

### 语义选择、reveal与焦点

执行层次：真实React/浏览器集成。规范依据：DESIGN §6.7.2 / 6.5，错误/初始加载以本次§6.7.1/.3修订为准。

| ID  | 输入/动作                                       | 预期结果                                                                       |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| S01 | 外部同时选中两个已加载实例，另有不可见项        | 只直接匹配的实例高亮；不截成第一项、不修改原选择                               |
| S02 | 端口/信号含bits/side，当前成功reveal指向其owner | 额外高亮reveal.rowId；原ref/bits/side和历史不变                                |
| S03 | 外部DefinitionSelection有多个occurrence候选     | 不猜实例、不发object/ancestors/roots/children；保留定义选择                    |
| S04 | 外部选择变化，组件外按钮持有DOM焦点             | 只展示新状态，不自动reveal、不抢焦点、不改历史                                 |
| S05 | 两视图共用模型，宿主唯一协调者在通知栈后reveal  | 只有宿主导航策略启动定位；视图订阅只安排渲染、不重入L6                         |
| S06 | 成功reveal目标在已加载首屏外，目标ref是端口     | 滚动至owner行最近边缘；不替换Selection、不移动已有活动行或DOM焦点              |
| S07 | 挂载时已有success且rowId可见，随后无关重渲染    | 允许初次滚动一次；不因重复渲染反复拉回目标                                     |
| S08 | 先success再失败/取消的reveal，旧目标在别处      | 不按旧success滚动，不自动重试，不写选择                                        |
| S09 | 首次Tab进入，有且仅有一个可见已选实例           | 优先该行；没有可见已选实例时取第一可见行                                       |
| S10 | 多个可见已选实例后首次进入                      | 活动项属于这些匹配可见实例之一；契约未指定其间优先次序，不擅冻数组第一项       |
| S11 | 离开树再进入，原本地活动RowId仍可见             | 恢复原活动项；不是把外部选择强制变成焦点                                       |
| S12 | 聚焦子孙后折叠祖先；旧parentId链有中间scope     | 找最近仍可见祖先；否则第一行；回退不写Selection                                |
| S13 | 分组模式切换导致活动scope消失                   | 沿旧parentId链回退owner或其它最近可见祖先，不靠数组索引跳邻行                  |
| S14 | reload移除活动行，前缀/祖先变化                 | 使用旧父链和新可见集回退；没有行时焦点留树容器，不保留已删除的无行加载按钮分支 |
| S15 | Ctrl/Shift点击或激活实例                        | 仍为普通单项替换；不发明范围、多选编辑或第二套选择历史                         |

### 键盘与页动作

执行层次：真实浏览器键盘。规范依据：DESIGN §6.7.2–3，错误/初始加载以本次§6.7.1/.3修订为准。

| ID  | 输入/动作                                    | 预期结果                                                                                     |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| K01 | Down/Up经过实例、scope、status及两端         | 按全部可见rows前后移动，端点保持；不展开、分页或写Selection                                  |
| K02 | 长树Home/End，仍有未加载next                 | 移到当前可见首/末行，不请求未知页，也不按当前DOM窗口截断                                     |
| K03 | Right用于关闭且可展开的实例/scope            | 展开；不改变语义选择，等待状态遵循L6                                                         |
| K04 | Right用于已打开且有可见子行的行              | 移到第一可见子行，包括合法status；不重复请求                                                 |
| K05 | Right用于leaf或无可见子行                    | 活动项保持，不生成虚构子节点                                                                 |
| K06 | Left用于已展开实例/scope                     | 折叠；原数据保留由L6保证，不改Selection                                                      |
| K07 | Left用于已关闭行、根行                       | 有可见父时移到父；根保持，不越界                                                             |
| K08 | Enter/Space用于pending status                | 转发cancel(owner)一次，不产生Selection；如有命令失败反馈，rowId为启动status.id，根也不是null |
| K09 | Enter/Space用于后续页status                  | 转发loadMore(owner)，焦点/页命令分离                                                         |
| K10 | Enter/Space用于failed/cancelled status       | roots用loadRoots，实例页用loadMore(owner)，不吞拒绝                                          |
| K11 | 树前后有可聚焦按钮，执行Tab/Shift+Tab        | 遵循浏览器Tab顺序进出；虚拟行不是额外Tab位，不困住焦点                                       |
| K12 | pointer点击scope/status行；外部已有Selection | 活动行可变化，语义选择不随scope/status动作变化                                               |

### 命令异常、晚结算和资源

执行层次：React集成 + plain Node拒绝监控。规范依据：DESIGN §6.7.1 / 6.7.3 / 6.6.5，错误/初始加载以本次§6.7.1/.3修订为准。

| ID  | 输入/动作                                                | 预期结果                                                                                                    |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| L01 | 页已success，但观察者同步抛值导致命令Promise拒绝         | 页面仍success；UI登记拒绝并回调原值，不从页成功推断命令成功                                                 |
| L02 | 命令独有拒绝为undefined/null/primitive/有害getter或Proxy | 固定操作失败；不读.message/.code/getter、不stringify/toString；回调error身份原样                            |
| L03 | 没有onCommandError，命令失败                             | 可见且辅助技术可发现的错误区域；不是仅console或后台拒绝                                                     |
| L04 | 一次命令多次重渲染及同一结算                             | 回调至多一次、结算后调用，不在L6通知栈执行                                                                  |
| L05 | 回调同步抛sentinel，命令原拒绝为original                 | 下一render抛AggregateError，errors顺序为[original,sentinel]；不回滚模型                                     |
| L06 | 回调返回Promise且自行处理其拒绝                          | 不await其异步工作或归入UI聚合；这不是允许未处理拒绝的测试                                                   |
| L07 | 合法select的同步观察者抛值，含undefined                  | 已提交选择/历史保留；原AggregateError在方法栈退出后微任务统一反馈一次，无回调可见操作失败；回调再抛聚合原值 |
| L08 | 预期cancelled/disposed结算，视图仍有效                   | 可仅呈相应模型状态、不重复全局提示；若调用回调必须保留原值                                                  |
| L09 | 未结算命令后卸载，随后旧Promise失败                      | 仍消费拒绝，不发本地错误、滚动、焦点或旧回调；不dispose/cancel借用模型                                      |
| L10 | 模型对替换，旧任务晚失败或旧同步反馈已排队               | 解绑旧订阅、重置局部会话；消费旧拒绝并丢弃排队反馈，不调用旧/新回调，不污染新焦点/滚动/诊断                 |
| L11 | 同模型卸载重挂，旧同步反馈/Promise在新挂载后失败         | 旧挂载token失效；新挂载读当前模型，不承接旧反馈或重复触发模型命令                                           |
| L12 | 两视图共用模型，卸载其中一个时有pending请求              | 任务和另一个视图继续；仅本组件订阅解绑，不发cancel或关闭SDK                                                 |
| L13 | StrictMode挂载/清理重放及重新渲染                        | 无额外查询、模型状态/历史不变，无残留重复订阅；清理不dispose借用模型                                        |
| L14 | 挂载后宿主先卸载全部视图，再dispose模型及client          | 晚回复不能复活UI；监听/模型/进程按各自所有者释放；不称通用堆内存上界证明                                    |
| L15 | 宿主dispose模型后强制触发一次render                      | 同步TypeError给宿主边界；不要求没有模型通知时组件能凭空检测dispose                                          |

### 窗口化与辅助技术

执行层次：真实浏览器DOM/AX + 手工辅助技术。规范依据：DESIGN §6.7.4，错误/初始加载以本次§6.7.1/.3修订为准。

| ID  | 输入/动作                                             | 预期结果                                                                                                   |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A01 | ariaLabel=Hierarchy，混合三类行                       | tree的可访问名称正确，aria-multiselectable=true；tree为单一DOM焦点                                         |
| A02 | 不同depth、leaf、可展开实例和scope                    | 行role=treeitem，aria-level=depth+1，仅可展开行有aria-expanded                                             |
| A03 | 多实例选择加scope/status同行                          | 只有实例有aria-selected；多项均能显示，不仅靠颜色表达                                                      |
| A04 | owner有next/pending/failed或尚未完整成功，含跨页scope | aria-posinset按当前投影，所有可能补充的对应兄弟组aria-setsize=-1                                           |
| A05 | owner完整终页；当前组含合法可导航status如有           | aria-setsize为当前投影兄弟数，不用Core子数或加载前缀冒充分组总数                                           |
| A06 | pending/失败/取消状态与操作错误                       | 可读文本和明确操作名；错误能在可访问性树发现，不限定未规范的具体CSS/DOM包装                                |
| A07 | 两个挂载实例共享同样RowId和模型                       | DOM ID全局隔离；各自aria-activedescendant引用自己存在的treeitem                                            |
| A08 | 固定height/rowHeight/overscan，5001实例，分数滚动偏移 | 窗口覆盖视口；treeitem数≤min(rows,ceil(height/rowHeight)+2*overscan+2)，含最多一额外活动行；不是照抄原型14 |
| A09 | 120层已加载121实例及status，滚动前中后                | 按同一窗口上界；显示depth与L6一致；不是任意深度或M7保证                                                    |
| A10 | 活动行滚出窗口，滚动由鼠标/外部动作造成               | 活动行DOM仍存在，aria-activedescendant不悬空，不抢外部DOM焦点                                              |
| A11 | 真实浏览器可访问性树观测，与纯DOM属性对照             | 核层次、活动项、展开和多项选择语义；DOM属性检查本身不写成AX通过                                            |
| A12 | 实际辅助技术逐键浏览/展开/错误重试                    | 手工验证层次/活动项公告；未运行时明确未执行，不以截图或AX快照代读屏合规                                    |

### 纵向链与回归

执行层次：浏览器E2E / Core集成 / 原B回归。规范依据：DESIGN §6.7.4 / 7 / 9，错误/初始加载以本次§6.7.1/.3修订为准。

| ID  | 输入/动作                                                             | 预期结果                                                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| E01 | 浏览器→生产HierarchyTree→真实Tree/Selection→真实SDK→公开可控Transport | 浏览/分页/选择/页外reveal/重试走完整UI链；可控Transport不是实际Core/Electron |
| E02 | 自有HIER_BIN、独立测试协议桥及手写SV fixture                          | 后续生产可用时覆盖浏览器→SDK→实际NDJSON Core；明确桥属测试，不称Electron IPC |
| E03 | 关闭/重开同一设计，两snapshot会话与晚回复                             | 旧视图/模型/任务不能改新UI；资源自然释放；首版不测试不存在的持久化格式       |
| R01 | 原选择241/33、树287/35+14/合法输入及Core链                            | 保留原B所有字节和oracle；新UI测试不替代前序单元                              |
| R02 | 生产L7依赖/类型出口与原协议、Schema、C++模型                          | 只经L6消费；不复制SDK/Schema规则，不改变原M0–M4兼容行为                      |
| R03 | Electron main/preload/renderer绑定与宿主关闭                          | §6.7明确留后续单元；本单元不建假Electron E2E或把NDJSON称Electron             |

## 本次24专项与矩阵关联

- C76-01三个激活分支及C76-02：I01/I02/I03与StrictMode首次零查询。
- C76-03失败/取消重试：I04/I05；C76-04/05：root及实例页成功移除status后的来源id、原错误与已提交页保持。
- C76-06/07：实例/scope开合、root/实例pending取消的实际方法/参数与触发行id区别。
- C76-08/09及undefined变体/10：同步void成功、观察者失败、微任务、原值/提交保留及无回调可见错误。
- C76-11同步/异步：回调抛undefined的聚合次序和宿主边界。
- C76-12/13的卸载、替换和同模型重挂：旧同步队列/Promise消费及旧反馈抑制。
- 关联不表示相应95条已全部覆盖，例如实例Enter/Space、完整键盘/ARIA/虚拟化与真实Core UI桥仍不在本专项中。
- 其余条款需继续转为实际测试；AX和辅助技术手工验证未运行，不以DOM属性/夹具控制通过代替。
- 窗口上界仍按原矩阵推导，不照抄A原型14行、不承诺M7/任意深度。

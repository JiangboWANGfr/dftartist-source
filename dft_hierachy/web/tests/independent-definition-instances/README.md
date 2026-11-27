# DefinitionInstancesModel：B64 有限独立冻结

依据固定ab368e84c6570217ca487c655319d5cb5f908084的DESIGN §6.24及明确继承§6.22.3/6.11/6.9.4/6.10.4/6.6.6、Core §5.5.5和Schema7/protocol2。只用规范/固定公开d.ts/原B fixture，不读A实现、consumer/witness/search.sv或自测反推oracle；必读摘要已见，不声称盲读。

## 可验证清单

- 91受控Transport上的真实SDK/模型场景：cases.mjs逐项id/group/input/expected/basis，含所有权4、options19、input24、targets2、pages17、tasks8、notifications12、意外错误2、诊断3。不是Core或Electron。
- 24严格类型负例：types.ts DI-T01–24；必需snapshot/def、无text/非法值、exactOptional/readonly深字段、五态联合/本地码与Promise边界。正确消费者必须先0诊断；只内存去标记，逐项语句有真实拒绝，无范围外诊断，无Node/React/Electron类型依赖。
- 3真实模型/SDK/Core链：core.mjs固定input/expected/basis；原B LF双occurrence原页/一页命令与显式Selection/Tree（含既有back/forward）、Core语义地址错误原对象与恢复、共享SDK取消/释放。
- 4 Node基础控制+1真实SDK/Core/Selection/Tree控制：Schema合法InstInfo五种kind、重复原行/opaque def、允许partial空且有next、原scope重复close；不调用新模型、不计新语义通过。

run.mjs --list或--core --list仅列清单，不执行产品。输入投影按snapshotId/def探测和Get一次、先全部投影后校验，异常/释放/重入优先；不解析地址/不读扩展字段。同值query加入/成功no-op，失败/取消显式从首或未提交页恢复。仅state/query/pages自有冻结，原Reply/InstInfo/重复/扩展/partial不重造；非法超页/重复cursor保留前缀，不预取/排序/合并共享定义。

每项除正常输入，还明确缺失/非法/继承/Proxy/自有undefined、原抛值cause、异步加入/取消/切换/迟到页、stale_cursor/原SDK错误、通知顺序/重入/AggregateError和同步dispose。受控fixture允许partial；当前真实Core正常页complete，不能以其通常complete收窄协议。真实Core基于原B b_sd_leaf/b_sd_top HDL，children.def/ref与literal left/right为独立公开元数据，不消费A见证输出。

## 执行与初始缺能力

Node24，先在自有固定产品目录原锁安装并Web check。显式HIER_B_PRODUCT_ROOT、HIER_B_BROWSER_TOOLS、HIER_BIN（B自有同树Core）、PATH前置Node目录。

```sh
node web/tests/independent-definition-instances/verify-types.mjs proposal
node web/tests/independent-definition-instances/verify-types.mjs production
node --test --test-timeout=30000 web/tests/independent-definition-instances/fixture-controls.test.mjs
node --test --test-timeout=60000 web/tests/independent-definition-instances/core-controls.test.mjs
node web/tests/independent-definition-instances/run.mjs
node web/tests/independent-definition-instances/run.mjs --core
```

proposal.d.ts逐字锁固定公开声明，仅编译，不是运行时替代。生产正向缺出口时24负例executed=0；生产模型缺失时91/3 planned、0executed、相应blocked、0skip，不能称94语义失败或通过。先独立commit冻结再跑新增基线，原结果追加B计划/共享日志；日志不提交。

借用已接受source-candidates scope，withModel=false后只构造新公开模型并登记原close数组，旧scope处理原Promise/SDK/Transport/模型/监听/子进程回收；无仿模型/私有hook/state写入/第二DTO。run.mjs沿原watchdog与unhandled回读，不新观察设施；watchdog防挂起而非产品SLA，有限拒绝/释放不代表任意then-free/堆/Q1证明。

## 覆盖缺口、歧义与交接

旧SearchModel100/26/4及source-candidates281/47/13已覆盖通用分页/诊断模式，但不能代新def投影与InstInfo页。新有限集合足以开始本单元实施；不扩张前置类别。未有具体规范矛盾时不自行指定新语义；对opaque合法字符串的地址存在性仅由Core定，错误码保持原SDK而不猜具体码。真实Core完整空未实例化定义与generate/blackbox/primitive广泛设计未新增前置真实HDL；五种合法InstInfo的原样保留由受控页覆盖，不据此冒称这些真实设计都已验收。

本单元无UI/Electron/宿主自动index.ready或选择后联动、无持久化/工程保存加载恢复迁移；不验收完整processor_core/M5/M7/读屏/跨平台/远端CI。旧树51/C-81/D-03/M6保持原归属。新C契约审查及本B有限冻结到位A直接复用现有分页机制实现；不将基础绿计新模型执行、不重开已接受搜索视图。

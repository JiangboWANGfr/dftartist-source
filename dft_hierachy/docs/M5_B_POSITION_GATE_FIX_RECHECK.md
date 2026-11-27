# B-ORCH-14 必需控制文件完整性修复独立复验

固定修复通过本轮窄复验，**关闭B-POSITION-GATE-01**；C-85仅由C审查/关闭，本报告不代C结论。
旧版同一21设施19过2败，新版21/21，必需文件分别缺失均非零且原退出/信号与正常入口保持。

## 固定对象与oracle

- 产品：`bc1a5d86f83ba9059a9b1f11114867063804351f`；旧版 `89ba7879300be09f115efa4464320f56f1c1c8be`。
- 规范SHA256保持 `3da148e187b7178c67e6e945de13ebd7ef98f24512647b6bae256c99c35e37c0`。
- 原设施冻结：`2223c974c1d190fe957c60ee291d8abd35667e8d`；B起点 `eedf3c71a2a3e11e998a05a860e10b905992de6b`。
- B分支test/m5-tree，E=`/tmp/hier-b-orch14-gates.6io7OGXp`，P=`E/source`，独立detached纯固定产品，无overlay。
- [计划](plans/B-position-gate-fix-recheck.md)、[机器档](m5_b_position_gate_fix_recheck.json)、
  [证据核验](../web/tests/independent-source-position/gate-fix/verify-evidence.mjs)。

oracle仍为B冻结、AGENTS/VALIDATION必需集合规则、DESIGN及公开接口，不读A实现/diff/自测定预期。
已读A摘要/计划，故不宣称严格盲测；不以A/C执行或会话完成当B验收。
没有新增/修改/放宽任何测试输入、预期、skip或xfail；旧14/7、19/2及accepted=false历史档保持原样。

## 条件、输入与覆盖

原21覆盖position model/core/controls成功、各入口exit/signal/missing、非法组合，以及cwd/产品根/环境/参数。
本缺陷的两个输入分别是缺facility.test.mjs或legacy-regression.test.mjs、另一文件仍存在；预期均非零。
正常controls仍须实际执行两个文件；保留旧串行入口停止和失败传播，controls仍按一个Node --test聚合判断。
不要求聚合中另一文件停止或文件exit23原样透传；原冻结已隔离NODE_TEST_CONTEXT，未在本轮改变。
21中的core是接线stub，不是Core运行；旧20保护identity/default-document入口，标准13验证真实SDK/L6全文与wire回归。
标准模型入口的32类型负例及258运行时另列，不能把设施当产品语义或UI验收。

## 本人实际命令及结果

Node24.21.0、TS5.9.3、Prettier3.6.2，macOS arm64。
B脚本cwd为B树，HIER_B_PRODUCT_ROOT显式指定旧P13或本轮P；标准命令cwd=P。
完整argv/cwd/完成UTC/时长/退出及合并stdout/stderr保存在机器档。

| 实际命令                                                                                                           | 退出 / 实际结果                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| P：`npm --prefix web ci --ignore-scripts --no-audit --no-fund`；`npm --prefix web run check`                       | 均0；71依赖，195定义/27方法、四包TS、46模块148依赖及7分层负控制                             |
| `HIER_B_PRODUCT_ROOT=<旧P13> node --test web/tests/independent-source-position/recheck/wrapper.facility.test.mjs`  | 1；21=19过2败，仅controls:missing:0/1，0skip/cancel；本轮实际重现，不是引用A原红            |
| 同一B文件，`HIER_B_PRODUCT_ROOT=P`                                                                                 | 0；21/21，0fail/skip/cancel/todo，含缺任一文件、失败/信号及正常双输入                       |
| `HIER_B_PRODUCT_ROOT=P node --test web/tests/independent-source-gates/wrapper.facility.test.mjs`                   | 0；原20/20，0fail/skip/cancel/todo                                                          |
| P：`npm --prefix web run test:independent:m5:source-position:controls`                                             | 0；原13/13（4设施+9旧全文/端点/SDK层控制），零skip                                          |
| P：`npm --prefix web run test:independent:m5:source-position`                                                      | 0；生产正例0诊断、32/32逐项语义负例及258/258模型，零fail/skip                               |
| 来源/保护审计；本轮Prettier/语法与`git diff --check`                                                               | 0；不声称全仓ESLint或远端CI                                                                 |
| `HIER_B_PRODUCT_ROOT=P node web/tests/independent-source-position/gate-fix/verify-evidence.mjs --inputs --product` | 0；15捕获/31材料/46pin/46压缩块，23项B输入和963次固定产品文件核验（含重叠pin），0新产品语义 |

21/20/13与258/32分别记账，旧/新对照不累加；本轮唯一非零捕获是预期旧版19/2反例。
原B13的2191/294/11Core是历史执行，不记成本轮结果。没有为原样报告导入重复全量。

## 来源、资源与兼容

核5个最终B导入文件原字节、241个旧测试文件全部保持；core/protocol/web生产包、package/lock、check.sh/ci及DESIGN与89整树相等。
本轮只接受门禁窄修复，产品/API/ABI、IPC、Schema、依赖和工程格式无变化；不修改queryAt或坐标oracle。
935主树非日志、633原B及917固定产品文件逐字节保持，主树暂存空，旧协调/research未跟踪内容保持。
42主树声明未动且与P独立web构建声明相等，旧P13仍为干净89，wrapper SHA256
`1296c1cb824671127c36f9da06bade7ea9578540ceeb524e4b88cf511dd2f89e`。
P修复wrapper SHA256 `7fd691159a1d67bbb3c2de6560bc859f47ea345a9cd78051827168852a9167a4`。
领取时日志1839935字节前缀SHA256 `261567cf9ff79f4500974e758d5f29da881ee8cf09e06992b053b72365cf568b` 保持。
临时测试目录、模型及借用SDK沿原设施finally收尾；没有新Core构建/进程或其它树二进制复用，不作全进程FD/内存负载验收。
15真实捕获、31材料及46来源pin完整可携，含本轮旧红与新绿；格式/核档/commit/最后日志回执另存E，避免递归归档。

## 限制及交接

未运行2191全集、M4/Schema、原生CTest/三配置/check.sh或Core11；生产、旧输入及命令同字节，按前轮B/C交接作比例适当复验。
未执行真实UI/Electron IPC/E2E、Linux/真实设计或远端CI，受控设施不替代L06/L09–11/main/preload。
21不覆盖全部权限/目录/符号链接/外部并发替换，不能宣称完整文件系统或TOCTOU安全保证。
自动ready/候选显示绑定/Selection/SourceView仍有后续前置，M5未整体完成，D-03仍限M6；首版无持久化，保存/恢复/迁移不适用。

B-POSITION-GATE-01依据本轮固定结果关闭；C-85交C独立处理，不代C审预检实现或关闭意见。
交A/协调器：本B未闭项已清，结合C对应结论按既定前置继续下一个已授权单元；不要为同字节报告导入另开审批或重跑全量。
不接管A/C/D，不新建会话/计时器，不恢复监控、不向其它会话发送或排队消息；本轮结束。

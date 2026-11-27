# B-M5-C79-LOCATOR-01：显式展开定位层修订

结论：C-79的未规范DOM形态过约束已从B测试中移除，定位10项及C80/C78合并回归66/66通过；交C复核关闭。
这不是生产HierarchyTree验收，真实组件缺出口/实际DOM定位配置仍待交付，不能以本对照放行全部95条件。

输入先冻35d540c76c1705ec4c9daab09028bc40802183cc；
固定设施7199ae4d0dc44fe86c807179110e0012662f5fcd；历史工具初88b4bd9、完整路径纠正fa682412。
B起点1a57006，产品本人干净2ad2450，DESIGN SHA36fd76c2b0df8f44827644ff045c789ce5175bb5be39f27d20dba1816f542de0。
依DESIGN §6.7.2/.4及C-79，不读A实现/diff/自测或C外置探针定义预期；共享摘要已读，非严格盲验。

## 验收、输入与原基线

规范要求实际显式展开操作仅一次setExpanded，展开提交正确且Selection/历史不变；未规定button标签/role/数量。
原B c925的438字节定位片段（SHA ae5e627b778f23a08770c156baf5a8eaf69e5717c4179bdec56f3ee5b2de7288）
在[独立B控件](../web/tests/independent-tree-view/ui/c79-locator-control.jsx)上执行：正常button通过；span、
额外无关button、行内指针区域三项均因原button数量断言失败，合计1过3失败、退出1。
执行的是原定位片段，不是缺失生产组件的整例；未实测生产误报，不把它称产品缺陷。

控件使用真实React和原B SDK/TreeModel/SelectionModel/公开Transport，点击委托真实公开setExpanded，
不是假HierarchyTree/假L6。控件只是定位与真实委托的对照，不证明生产L7事件/ARIA行为。

| 新输入                                                    | 预期/判断依据                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| button、无button的span、含无关button、row自身指针区域四项 | 事先明确实际点击目标/位置；真实点击一次，真实setExpanded一次，已发布expanded=true，Selection/back/forward保持 |
| 未配置、缺目标、多目标、目标在源行外、无效返回值五项      | 明确B_TEST_EXPANSION_LOCATOR_PRECONDITION，零点击/模型命令，不猜其它button或用方向键替代                      |
| 非函数配置一项                                            | 使用前TypeError拒绝，不能隐式接受无效适配                                                                     |

共10项；默认实际生产UI140库存不增为150。旧四形态与新四形态是同一分区前后控制，不重复算八个新业务场景。

## 定位边界与修改

[expansion-target](../web/tests/independent-tree-view/ui/expansion-target.mjs)是唯一B测试侧定位设施。
B提供模块HIER_B_EXPANSION_ADAPTER，命名导出locateExpansionTarget({page,row,rowId})，返回{target,clickOptions?}。
只能定位已观察的真实DOM/点击区域，不发模型命令、不改私有字段、不替代组件；不要求生产新data/class/标签/角色。
target唯一并属于源行（允许行本身+指针坐标）；没有“唯一button就是展开”的自动猜测。
配置清理释放；B自有前置错误用WeakSet识别，不读取任意异常的code/getter。

[旧UI-EXPAND-control](../web/tests/independent-tree-view/ui/cases.mjs)仅替换定位段；原Selection/history与单次setExpanded判据保持，
另补已提交expanded=true断言。其余139例及公共helper代码逐字保持（扣除新import/此case子段核验）。
[运行器](../web/tests/independent-tree-view/ui/run.mjs)先核生产导出，再加载B定位配置；缺配置在语义集合前非零且0执行，
不是产品语义失败/skip。有配置但某例目标无效时明确标测试前置，未执行数单列，整体仍失败，不改成绿。
这两个真实生产路径当前因组件缺失而尚未运行；直接helper前置控制已跑，不能将二者等同。
普通/实际Core fixture自检不需该配置；finally清除定位配置，不破坏C78清理或C80报告。

此配置是B测试适配，不是新的产品DOM契约。实际组件交付后B仍需从可见DOM选择/冻结其映射并交C核，
本轮没有虚构该映射或修改A实现来匹配测试。

## 固定修订实际回归

- 定位10/10；同次C79十项+C80三十一+C78二十五为66/66，无skip/todo/cancelled。先前单独10是重叠开发执行，不累加。
- C79控件React root/模型/SDK在finally释放，日志实测browser断开/server停止；原C78实际Core/浏览器资源、C80五份真实失败报告仍通过。
- 原140枚举前后42609字节完全相同，SHA 6f2333cf262f6a74e1675780d708bc32bba598850491eb3ade7c1791a7fb832d。
  输入/预期/依据/映射/既有C77限制不改；95映射/140库存/8手工步骤检查通过。
- 普通fixture自检0；真实Core浏览器桥自检0（12行/11查询、两snapshot，exit0/signal null、缓存/poll/监听释放），无实际生产树。
- 标准268/268与810/810通过；两者重叠不累加。实际默认生产入口仍1：缺HierarchyTree，140计划/0执行/0skip，先于定位前置，完整JSON与资源回收。
- 原433文件中430字节保持，仅ui/README、cases、run三个明确设施例外；C76/C77/C78/C80及旧报告/归档/核验器均保持。
- 本人产品2ad干净，283生产/native/构建/锁输入及三份本人Core SHA保持，结束无本人Core进程。

Node24.21.0/macOS arm64/本人Chromium156.0.8078.4；browser技能首选接口不可用已告知，独立Playwright回退，未借A/C状态。
本单元无native重编、全check.sh/75-78-80/Schema重跑；npm原增量tsc-b，不称fresh构建。
无API/ABI/IPC/Schema/默认值/生产依赖/锁或工程格式变化。

## 历史、证据与复跑

主归档SHA256为d56d5cb55df69cfaa991225d86c08066f735c9f6fcff5a0339e0eef58a7bd601。
[后检记录](m5_b_c79_expansion_locator_archive_checks.json)另存归档/八来源/枚举/资源、格式与空白三项完整输出，均0。

[版本核验器](../web/tests/independent-tree-view/ui/c79-verify-history.mjs)保留三份原档：旧UI32捕获/27 Git来源，
C78 16捕获/10来源，C80 10捕获/6来源。分别明确当前UI四差异、C78两差异、C80固定源零差异，
不修改历史hash或旧严格核验器，不把旧运行改记新版。
该新工具首次按basename误把C76同名case/run列作应变化，退出1已完整保留；修为完整ui路径后0，C76未改，业务预期未动。

[机器证据](m5_b_c79_expansion_locator.json)：16条完整捕获266942原字节/45076gzip字节，
包括原1/3失败、目标66通过、能力红、新历史工具失败/纠正、两份完整枚举及8份固定/历史源。
[核验器](../web/tests/independent-tree-view/ui/c79-verify-evidence.mjs)逐份解压/长度/SHA/退出与枚举逐字/固定源核验：

```sh
node web/tests/independent-tree-view/ui/c79-verify-evidence.mjs
HIER_B_PRODUCT_ROOT=/absolute/B/source node --unhandled-rejections=throw --test web/tests/independent-tree-view/ui/c79-locator.test.mjs
```

交C：请核35d540c/7199ae4及本报告关闭C79；B不自行关闭C79/C80，C78按C正式关闭状态保持。
交A：可吸收B定位层修订，不强迫DOM配合测试、不把对照10/66或库存140当生产UI通过。
已批准L02、L06/原Promise观察及Electron冻结后续独立继续；实际140生产UI/AX/读屏、Electron/M7/真实设计/Linux/远端CI/覆盖率仍未验证。
首版无保存恢复/旧迁移/计划编辑undo-redo；共享日志只追加不提交，协调/research/ref/旧工程保持。

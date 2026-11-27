# Agent B：C-51 新交接诊断负例独立冻结（2026-10-11）

收尾读取最新REVIEW_LOG时收到C-51；本补充不改变已冻结的C-49/C-50/D测试。
依据公开Design/Diagnostics、DESIGN 4.8、5.1/5.2和既有“编译错误仍可浏览”行为，
不读A的修复代码、C探针或内部诊断收集来制定预期。输入是独立的固定fixture。

新增公共API目标b_m3_library_diagnostics，3用例：

1. unpacked a[2]元素宽4不能赋给已知库input A6；库/真实声明两条路径都必须
   可打开浏览且有1个公开error，message非空、file为fixture、line为各自连接行8/14。
2. streaming源8接库/真实声明input6不能容纳：同样error1、连接位置11/17。
3. 正例streaming源8接库/真实声明input8：error0、complete、根other8、Write.deps
   与uses完整a8/conservative/all/data、exprMap根结果identity8；verifyFacts mismatch0。

每用例矩阵shared/per-instance×cache0/64MiB。负例还在一个快照中重复bindings/
procs/proc/verifyFacts三次，核对diagnostics计数/每条位置文本保持，不追加重复诊断；
verifyFacts必须拒绝“无错误通过”（mismatched>0、issues非空）。不规定非法事实
查询必须成功，也不将unsupported/partial当成替代编译错误。故意错误不等同
无LibraryProvider的unknown方向；使用明确方向/宽度的库并用真实声明作控制。

测试先冻结，再独立在固定2a58463三配置执行；之后在23dcc05记录修改前基线。
此负例是C新增缺陷的独立回归，不代C关闭，不改产品，也不要求新的协议/Schema。
源码位置数字只来自本fixture的冻结字节，不对产品诊断文字逐字猜测。

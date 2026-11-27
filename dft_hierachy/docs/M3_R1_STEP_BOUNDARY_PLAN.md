# R1-B：C-53/C-54边界增量冻结

收尾收到C最小HDL与契约引用，依据DESIGN SHA487211ce…的§4.4/5.4/5.5.1/5.5.2独立补测；不读取C探针源码或A实现。固定待修复产品37a1b3c，本次它是两缺陷的红基线；8a这套新边界集合不重复运行，不据此判断引入提交。原六API/三适配/80 CLI保持不变。新集合单列分母，不把它加入原80。

输入step_boundaries.sv：unknown absent cell合法streaming左值data4；同连接declared output/input4正反对照，API另用独立LibraryProvider冻结Out/In4；编译error0是前提，不用非法HDL证明缺口。C53复用原flow.sv EMPTY与A，引脚分别未知/已知宽度。
- CLI3方法/API3用例：EMPTY inside/outside×back/forward，整体partial/unknown_pin_width优先，不虚构at/map/next；API强制nonempty bits拒绝，已知width未知direction对照partial/blackbox。
- unknown streaming data whole4与clip1+2，反查step必须unresolved/blackbox via P，drivers必须保留可能驱动与partial/blackbox at P；不能返回complete空集。正向至少有输入读关系和loads，不猜确切operator映射或方向，不把unresolved当known wire。
- declared及library output：合法HDL、P4/out、drivers与back不得empty complete；streaming左值内部表示若unsupported保留语义缺口，不强制精确映射。input：P4/in，data无驱动/前驱且complete空、正向有读取。多方向cache0/64MiB/shared/per-instance。
- 单列未指定细节：unknown非平凡输出当前V1不能安全精确发布位映射，测试只要求有原因的可能关联/显式unresolved；不从C实现解释猜map或operator支持范围。

先独立commit冻结再链接三配置真实公开API/CLI，保留红结果交A修复；正式关闭C意见归C。报告记录实际失败位置/断言数和绿色对照，不改原期望取绿。仅B测试/fixtures/注册/docs变化，无产品/API/Schema变更。

首次新API三配置编译退出2，Catch2不支持裸&&分解；仅加外层括号，表达式/期望不变，另commit冻结再编译。此为B测试构建适配，运行0，不报产品编译缺陷。

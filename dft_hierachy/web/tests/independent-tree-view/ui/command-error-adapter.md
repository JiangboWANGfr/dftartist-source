# B-UI-ADAPTER-01：直接 unknown 命令失败的测试适配申请

## 已明确的规范，不重新询问契约

DESIGN §6.7.3 已明确：同步抛值及 Promise 拒绝原样保留，包括 undefined；
无回调时固定“操作失败”，不得读取 raw.message/code/getter、toString/JSON.stringify。
回调再抛时按 [原值, 回调抛值] 交下一 render 的 AggregateError。
本文件不是要求修改/重审 C-76 或允许参考实现改变预期。

## 当前可达范围和缺口

当前真实 L6 的观察者抛 primitive/Proxy，由 L6 包装成 AggregateError。
C-76 原测试与新 UI-ERROR-observer-* 验证这个真实 AggregateError、原内层值身份和零 poison 读取。
**这不等于命令本身直接抛 primitive/Proxy**，故不将 L02 全分支计作已覆盖。
不改实际模型私有状态，也不提供假 TreeModel/HierarchyTree 来取绿。

## 拟申请 C 审核的窄适配（尚未实施/执行）

仅对每个测试自有的真实模型公开方法做故障 interposition：

1. 保存 own descriptor/原方法；从 DOM 动作调用时先原样委托真实 select/loadRoots。
2. 同步 select 成功提交后，在公开方法出口抛指定 raw；
   异步 loadRoots 的真实 Promise 成功后，测试包装 Promise 再以指定 raw 拒绝。
   这里**刻意替换命令结算**，必须明确记为 L7 边界单元故障测试，不伪称 L6 实际原拒绝。
3. 不变更模型类型、getters、rows、订阅、私有队列或时钟；不改变真实查询/选择提交。
   测试后恢复原 descriptor；控制 Promise 拒绝全部被观察。
4. raw 输入：undefined、null、0、false、空串、冻结对象、所有 Get/ownKeys/getPrototypeOf
   均记数并抛错的 Proxy。分别测试同步及异步，含 callback absent/capture/throw。
5. 每项判断：动作一次、已提交状态保留、同步反馈在方法栈退出后微任务；
   回调 error===raw（Object.is）、来源行保持；无回调固定文案且零 raw 探测；
   回调抛 undefined 的聚合有两个真实条目，顺序精确；晚会话反馈消费但不发布。
6. 适配获 C 认可后由 B 冻结独立可执行文件及初红；不得在当前140用例里悄悄添加/skip，
   不使用环境变量自我授权 C 审核，也不把本申请算可执行测试。

状态：**待 C 审适配**。当前没有新的规范歧义；本缺口单独交接，不阻塞已经可冻结的其余测试。

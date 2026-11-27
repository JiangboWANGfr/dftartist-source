# 共享对象标注：编译消费者

权威行为见 [DESIGN §6.31](../../../docs/DESIGN.md)，执行/兼容范围见
[标注契约计划](../../../docs/plans/M6-annotation-contract.md)。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/annotation-layer/tsconfig.json --pretty false
```

从仓库根运行；需要既有生产包声明已经构建。消费者组合真实已发布的图/布局/树/选择类型，
借用模型，拥有自己的两层标注及React root。含旧Props兼容和18个有限负类型见证。
原独立提案固定于0a4f0ef；A90生产发布后，proposal.d.ts转为实际公开根的类型转发，
避免两个AnnotationLayer私有品牌与新增Props互相冲突，接口和负类型预期不变。
消费者只编译，不执行；proposal.js不存在，不提供mock层/替代图实现，不进入生产出口。
运行时验证使用B90原22模型/10浏览器/20类型与原生输入控制的标准入口
`npm --prefix web run test:independent:m6:annotations`；类型通过不代替运行时验证。

C89已接受契约、B90已有限冻结；A90生产实现和实际结果见上述执行计划。
原扁平API不再重审；折叠/边界重布线、组合demo/包外视图消费仍为后续M6实际交付。

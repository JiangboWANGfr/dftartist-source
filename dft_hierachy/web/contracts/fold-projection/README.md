# 折叠投影编译消费者

新增契约见[DESIGN §6.32](../../../docs/DESIGN.md)，实施及兼容边界见
[执行计划](../../../docs/plans/M6-fold-projection.md)。C92已接受，B93冻结已导入；
A93生产实现后，proposal.d.ts转发真实包根，保持一个权威类型/私有品牌。

```sh
node web/node_modules/typescript/bin/tsc -p web/contracts/fold-projection/tsconfig.json --pretty false
```

从仓库根执行，需要已构建的真实生产包声明。消费者借用已发布GraphSession/SelectionModel/AnnotationLayer，
编译检查新投影→原成员反查→精确选择/标注组合，以及原平铺布局和SchematicView调用。
18个有限负类型见证约束显示身份分域、私有投影品牌、代次、只读和旧API兼容；不是B独立oracle。

本目录没有proposal.js；运行时使用`@hier/viewmodel`公开根，当前生产门禁为：

```sh
npm --prefix web run test:independent:m6:fold
```

门禁直接执行B原24模型/20类型/1合法输入控制，无提案回退。
FoldedGraphProjection不能传给现有LayoutService；布局/原视图接入与原生ELK下的A17仍需实际交付。
不将编译通过称为折叠运行时、取消、UI或整个M6已通过。

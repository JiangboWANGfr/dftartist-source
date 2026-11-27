# PropertiesPanel 实例属性增量：隔离契约

唯一行为规范为DESIGN §6.19。本目录只做声明/宿主消费者编译，不进入生产包exports或UI门禁，没有组件运行时或假实现。
依赖已交付的InstancePropertiesModel/SelectionModel及当前React类型；不复制数据DTO，不安装依赖。

```sh
npm --prefix web run check
node web/node_modules/typescript/bin/tsc -p web/contracts/properties-panel/tsconfig.json --pretty false
```

消费者显示显式宿主目标与借用模型组合、回调原错误/原目标/选择ref的类型收窄，另含11个expect-error负例。
类型通过只说明提案可表达；C54已接受契约、B54已冻结有限集合。生产组件位于web/packages/views，实际运行门禁见docs/VALIDATION.md，本隔离目录继续保留历史声明，不作运行时验收。
旧树51条观察设施失败不由这里放宽，也不作为本新面板的额外前置。
完整PropertiesPanel的对象/位段驱动负载、定义候选与自动目标协调另行推进，不能以本声明或实例增量完成代验。

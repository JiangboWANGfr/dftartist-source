# SourceHit 地址判别提案材料

规范为DESIGN §6.16。本目录保留A25/146bfa6尚无refKind时的准备证据，不是当前运行时门禁。
C26已通过契约、B26已冻结；当前实现/验证入口见docs/plans/M5-source-ref-kind-runtime.md与docs/VALIDATION.md。

- `proposal.d.ts`仅扩展现有生产DTO的可选字段，不复制SourceHit。
- `consumer.ts`在现有Protocol/Selection类型上证明旧输入兼容、显式缺字段分支与互斥地址；不执行确认操作。
- `verify-types.mjs`逐一删除16个expected-error标记并检查实际诊断位置/类型，不以缺模块取绿。
- `schema-extension.json`是待审增量材料；`schema-compatibility.mjs`仅在内存中合并权威Schema，
  与当前生产验证器对照。旧验证器忽略未知字段不等于新字段语义已实现，当前Schema/生成器不写入。
- `core-capabilities.test.mjs`以已有SDK/真实Core查询公开定义、实例、process元数据，证明definition范围地址歧义及分页保持。
  fixture只读；不按前缀分类、不向Core回复注入新字段。明确断言现有Core缺字段，这是历史能力见证，实施后不可当新字段验收门禁。

仓库根命令（固定Node工具链）：

```sh
node web/contracts/source-ref-kind/verify-types.mjs
node web/contracts/source-ref-kind/schema-compatibility.mjs
HIER_BIN="$PWD/core/build/hier" node --test web/contracts/source-ref-kind/core-capabilities.test.mjs
npm --prefix web run check
```

原A25能力见证不包含新Core标记、公开C++布局/序列化、旧/新服务混用的完整SDK会话、候选确认或UI/Electron整链。
这些由C审/B冻结后实施验收；本轮不声明它们通过。schema7可选扩展和C++消费者重编边界见DESIGN。

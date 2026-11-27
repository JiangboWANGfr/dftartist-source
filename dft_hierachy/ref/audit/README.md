# 当前 Hierarchy 图合并问题的最小复现

这组诊断直接导入旧项目 `dft-suite/src/hierarchy/core/schematic.ts`，只在内存中构造节点和边，不修改旧代码或设计文件。

## 运行方法

在工作区根目录 `/Users/jiangbowang/MOI/2025/dftartist/2026.9` 执行，使用该工作区已经存在的 Rolldown：

```sh
dft_planner/dft-suite/node_modules/.bin/rolldown dft_hierachy/ref/audit/reproduce.ts --platform node --file /tmp/dft-hierarchy-reproduce.mjs --format esm
node /tmp/dft-hierarchy-reproduce.mjs
```

这不是发布验收测试。**退出码 0 表示三个旧问题全部被复现，不能解释为功能正常。** 如果日后原实现变化，退出码 1 表示至少一个旧结果已不同，应重新检查输出；同样不能单独证明重写已正确。

## 已记录结果

| 场景 | 正确行为 | 当前实际行为 |
|---|---|---|
| 不同实例中同文件同行的语句 | 不应复用另一实例的节点 | 返回 `soc.u_a` 的逻辑节点 |
| 不同作用域的同名 `clk` 端口 | 不应复用另一作用域的端口 | 返回 `soc.u_a.clk` |
| 对已存在驱动的引脚新增不同驱动 | 同时保留 A、B 两条连接 | 只保留 A |

实际 JSON 见 [reproduced-findings.json](reproduced-findings.json)，源码见 [reproduce.ts](reproduce.ts)。其他静态检查发现、测试基线限制与新模块验收要求见 [重写评估](../HIERARCHY_REWRITE.md)。

样例用 `/synthetic/unit.sv:10` 作为纯数据标记，不读取该文件。此次复现覆盖前端图合并逻辑，未启动 HDL 后端、Electron、布局引擎或真实芯片工程。

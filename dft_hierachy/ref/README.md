# Hierarchy 重写参考项目

已从官方 GitHub 仓库下载 11 个项目，保留各自 Git 仓库和许可证。此目录用于重写前的源码研究。

现状审计、模块职责、重写架构和验收要求见 [HIERARCHY_REWRITE.md](HIERARCHY_REWRITE.md)。精确上游地址、分支、提交、子模块信息及校验结果见 [projects.lock.json](projects.lock.json)。

所有仓库采用 `git clone --depth 1 --single-branch` 下载。当前检出的源码齐全，历史为浅克隆；尚未安装依赖、初始化子模块或构建项目。Yosys 有尚未初始化的子模块，清单已记录。Git 对象连接检查通过不能代替构建/运行验证。

| 目录 | 研究重点 | 检出版本 |
|---|---|---|
| [d3-hwschematic](d3-hwschematic/) | 模块/引脚图、网络分支选择、层级展开、可定制符号；用于网表浏览交互和绘图投影设计。 | `0664665d87d7` |
| [elkjs](elkjs/) | 固定端口顺序、层次布局、正交路由、Worker API。 | `722f1a3f6301` |
| [hal](hal/) | Netlist/Module/Net/Endpoint 分层；局部图上下游导航；属性、选择联动、图上下文与分析插件。 | `acc899e297ed` |
| [slang](slang/) | 参数化实例、generate/数组展开、类型、端口连接表达式、源位置和编译诊断。 | `2f93a7a12fed` |
| [yosys](yosys/) | SigBit/SigSpec、信号别名归一化、常量与逐位连接、JSON 中的位向量表达。 | `fb1a2fdae7a8` |
| [react-arborist](react-arborist/) | 虚拟化行、键盘导航、选择/展开状态、过滤和滚动定位。 | `d74c4ec696ba` |
| [netlistsvg](netlistsvg/) | 网表转绘图结构、总线表示、器件皮肤、SVG 输出。 | `d3518f1b5c99` |
| [x6](x6/) | 节点/端口/边模型、选择、撤销重做、事件和导出扩展。 | `b14ca2754069` |
| [kactus2](kactus2/) | IP-XACT、端口映射、总线接口、层级设计、连线校验与修改命令。 | `342bc30c2947` |
| [digitaljs](digitaljs/) | 子电路、端口位宽、仿真状态与图形显示关联。 | `a77a6b3a9169` |
| [adaptagrams](adaptagrams/) | libavoid 的避障正交连线、多端点连接与交互式重新布线。 | `840ebcff20db` |

## 建议阅读顺序

1. `slang`、`yosys`：先确定实例、作用域、总线位连接、常量和未知状态的语义。
2. `hal`：设计独立于界面的查询服务、图上下文、选择联动和插件边界。
3. `react-arborist`：设计大规模实例树的显示和导航。
4. `d3-hwschematic`、`elkjs`、`netlistsvg`：设计局部网表投影、固定引脚顺序、网络分支和导出。
5. `x6`、`kactus2`：需要规划编辑时，研究事务、撤销、端口映射和校验。
6. `digitaljs`、`adaptagrams/cola/libavoid`：按信号显示和交互式布线需求补充研究。

核心组合是 Slang 的语言语义、Yosys 的逐位连接表达、HAL 的查询/交互组织、ELK 的布局和虚拟化树。画布通过适配器消费统一数据；最终选用哪一种绘图库，应由同一组真实网表的功能与性能验收决定。

## 逐项目源码入口

### d3-hwschematic — 核心交互参考

官方仓库：[打开上游](https://github.com/Nic30/d3-hwschematic)。

模块/引脚图、网络分支选择、层级展开、可定制符号；用于网表浏览交互和绘图投影设计。

图形库的输入不是全设计数据库；默认端口点击追踪与完整编辑仍需应用实现。

- [README.md](d3-hwschematic/README.md)
- [src/d3-hwschematic.js](d3-hwschematic/src/d3-hwschematic.js)
- [src/dataPrepare.js](d3-hwschematic/src/dataPrepare.js)
- [src/node_renderers/generic.js](d3-hwschematic/src/node_renderers/generic.js)
- [src/yosys.js](d3-hwschematic/src/yosys.js)
- [examples/example.html](d3-hwschematic/examples/example.html)

### elkjs — 核心布局候选

官方仓库：[打开上游](https://github.com/kieler/elkjs)。

固定端口顺序、层次布局、正交路由、Worker API。

只计算几何布局；连接是否正确应由设计数据库决定。

- [README.md](elkjs/README.md)
- [src/js/elk-api.js](elkjs/src/js/elk-api.js)

### hal — 核心架构参考

官方仓库：[打开上游](https://github.com/emsec/hal)。

Netlist/Module/Net/Endpoint 分层；局部图上下游导航；属性、选择联动、图上下文与分析插件。

偏门级网表分析；其 Qt 界面和数据模型需要按本项目 RTL 需求适配。

- [include/hal_core/netlist/netlist.h](hal/include/hal_core/netlist/netlist.h)
- [include/hal_core/netlist/module.h](hal/include/hal_core/netlist/module.h)
- [include/hal_core/netlist/net.h](hal/include/hal_core/netlist/net.h)
- [include/hal_core/netlist/endpoint.h](hal/include/hal_core/netlist/endpoint.h)
- [include/hal_core/netlist/decorators/netlist_traversal_decorator.h](hal/include/hal_core/netlist/decorators/netlist_traversal_decorator.h)
- [plugins/gui/src/graph_widget/contexts/graph_context.cpp](hal/plugins/gui/src/graph_widget/contexts/graph_context.cpp)
- [plugins/gui/src/graph_widget/graph_navigation_widget.cpp](hal/plugins/gui/src/graph_widget/graph_navigation_widget.cpp)
- [plugins/clock_tree_extractor/src/clock_tree.cpp](hal/plugins/clock_tree_extractor/src/clock_tree.cpp)

### slang — 核心语言前端候选

官方仓库：[打开上游](https://github.com/MikePopoloski/slang)。

参数化实例、generate/数组展开、类型、端口连接表达式、源位置和编译诊断。

现项目已使用 Slang；重写应重新设计其输出适配层。下载的上游版本不代表立即升级现有二进制。

- [README.md](slang/README.md)
- [include/slang/ast/symbols/InstanceSymbols.h](slang/include/slang/ast/symbols/InstanceSymbols.h)
- [include/slang/ast/symbols/PortSymbols.h](slang/include/slang/ast/symbols/PortSymbols.h)
- [source/ast/symbols/PortSymbols.cpp](slang/source/ast/symbols/PortSymbols.cpp)
- [source/ast/expressions/SelectExpressions.cpp](slang/source/ast/expressions/SelectExpressions.cpp)
- [include/slang/text/SourceManager.h](slang/include/slang/text/SourceManager.h)
- [tests/unittests/ast/HierarchyTests.cpp](slang/tests/unittests/ast/HierarchyTests.cpp)
- [tests/unittests/ast/PortTests.cpp](slang/tests/unittests/ast/PortTests.cpp)

### yosys — 核心连接模型参考

官方仓库：[打开上游](https://github.com/YosysHQ/yosys)。

SigBit/SigSpec、信号别名归一化、常量与逐位连接、JSON 中的位向量表达。

采用位级建模思路；综合变换会改变原始 RTL 结构。不要将综合图直接当作原始实例层级。

- [kernel/rtlil.h](yosys/kernel/rtlil.h)
- [kernel/sigtools.h](yosys/kernel/sigtools.h)
- [backends/json/json.cc](yosys/backends/json/json.cc)

### react-arborist — 核心树视图候选

官方仓库：[打开上游](https://github.com/jameskerr/react-arborist)。

虚拟化行、键盘导航、选择/展开状态、过滤和滚动定位。

懒加载与全设计搜索需要接入查询服务；HDL 实例层级不能随意拖动重命名。

- [README.md](react-arborist/README.md)
- [modules/react-arborist/src/components/tree.tsx](react-arborist/modules/react-arborist/src/components/tree.tsx)
- [modules/react-arborist/src/components/default-container.tsx](react-arborist/modules/react-arborist/src/components/default-container.tsx)
- [modules/react-arborist/src/interfaces/tree-api.ts](react-arborist/modules/react-arborist/src/interfaces/tree-api.ts)
- [modules/react-arborist/src/data/create-list.ts](react-arborist/modules/react-arborist/src/data/create-list.ts)
- [modules/react-arborist/src/state/selection-slice.ts](react-arborist/modules/react-arborist/src/state/selection-slice.ts)

### netlistsvg — 网表投影与导出参考

官方仓库：[打开上游](https://github.com/nturley/netlistsvg)。

网表转绘图结构、总线表示、器件皮肤、SVG 输出。

适合图形导出与转换设计；交互追踪和会话管理由新模块实现。

- [README.md](netlistsvg/README.md)
- [lib/YosysModel.ts](netlistsvg/lib/YosysModel.ts)
- [lib/FlatModule.ts](netlistsvg/lib/FlatModule.ts)
- [lib/elkGraph.ts](netlistsvg/lib/elkGraph.ts)
- [lib/drawModule.ts](netlistsvg/lib/drawModule.ts)
- [lib/Port.ts](netlistsvg/lib/Port.ts)

### x6 — 编辑画布候选

官方仓库：[打开上游](https://github.com/antvis/X6)。

节点/端口/边模型、选择、撤销重做、事件和导出扩展。

规划编辑需要电气规则和事务层；多端点网络投影到多条边时须保留共同 NetId。

- [README.zh-CN.md](x6/README.zh-CN.md)
- [src/model/node.ts](x6/src/model/node.ts)
- [src/model/port.ts](x6/src/model/port.ts)
- [src/model/edge.ts](x6/src/model/edge.ts)
- [src/plugin/history](x6/src/plugin/history)
- [src/plugin/selection](x6/src/plugin/selection)
- [site/docs/tutorial/basic/port.zh.md](x6/site/docs/tutorial/basic/port.zh.md)

### kactus2 — 接口规划参考

官方仓库：[打开上游](https://github.com/kactus2/kactus2dev)。

IP-XACT、端口映射、总线接口、层级设计、连线校验与修改命令。

适合参考 DFT/MBIST 接口规划；不承担 SystemVerilog 行为分析。

- [README.md](kactus2/README.md)
- [IPXACTmodels/Component/PortMap.h](kactus2/IPXACTmodels/Component/PortMap.h)
- [IPXACTmodels/Component/validators/PortMapValidator.cpp](kactus2/IPXACTmodels/Component/validators/PortMapValidator.cpp)
- [editors/HWDesign/HWDesignDiagram.cpp](kactus2/editors/HWDesign/HWDesignDiagram.cpp)
- [editors/HWDesign/undoCommands](kactus2/editors/HWDesign/undoCommands)
- [library/HierarchyModel.cpp](kactus2/library/HierarchyModel.cpp)

### digitaljs — 信号显示补充参考

官方仓库：[打开上游](https://github.com/tilk/digitaljs)。

子电路、端口位宽、仿真状态与图形显示关联。

只有接入真实仿真/分析结果后才能显示对应信号值。

- [README.md](digitaljs/README.md)
- [src/circuit.mjs](digitaljs/src/circuit.mjs)
- [src/cells/subcircuit.mjs](digitaljs/src/cells/subcircuit.mjs)

### adaptagrams — 路由补充参考

官方仓库：[打开上游](https://github.com/mjwybrow/adaptagrams)。

libavoid 的避障正交连线、多端点连接与交互式重新布线。

C++ 路由库；在确定交互布线需求后再评估本地服务或其他适配方式。

- [cola/libavoid/doc/description.doc](adaptagrams/cola/libavoid/doc/description.doc)
- [cola/libavoid/doc/example.doc](adaptagrams/cola/libavoid/doc/example.doc)
- [cola/libavoid/router.h](adaptagrams/cola/libavoid/router.h)
- [cola/libavoid/connector.h](adaptagrams/cola/libavoid/connector.h)
- [cola/libavoid/hyperedge.h](adaptagrams/cola/libavoid/hyperedge.h)

## 第二批补充项目（2026-10-06）

第一批偏语言前端和绘图，这一批补“层次化网表数据库、对象身份和查询接口怎么设计”。下载方式与第一批相同（浅克隆，未装依赖，子模块未初始化）；naja、yosys-slang、circt 有未初始化的子模块，清单已记录。

| 目录 | 定位 | 研究重点 | 检出版本 |
|---|---|---|---|
| [opensta](opensta/) | 核心查询接口参考 | 抽象层次网表接口 Network（Instance/Pin/Net/Term + 迭代器），算法只依赖接口；层次引脚的驱动/负载遍历；通配符对象查找。 | `7a034b56de14` |
| [naja](naja/) | 核心身份模型参考 | SNLPath/SNLOccurrence 表示实例上下文中的对象，不展平即可区分多次实例化；BusNet/BusNetBit 位级网络；Equipotential 跨层等电位。 | `50306aa86623` |
| [slang-netlist](slang-netlist/) | 核心前端适配参考 | 基于 Slang AST 构建位范围级的驱动/依赖图、路径查找、组合环检测、驱动与端口报告。 | `39eae34cdf6e` |
| [yosys-slang](yosys-slang/) | 位级降级参考 | Slang AST 到 Yosys SigSpec 的降级：左值切片、寻址、拼接、类型转换如何逐位落地。 | `1582cc2d5bd1` |
| [circt](circt/) | 身份与实例图参考 | InstanceGraph、层次路径 hierpath、内部符号 inner symbol：定义与实例分离，对象引用不依赖字符串路径。 | `1b6dd691aee4` |
| [sprotty](sprotty/) | 图投影分层参考 | 服务端持有图模型、客户端只渲染、通过 action 协议增量更新；内置 ELK 布局适配。 | `21b80fc2c852` |

### opensta — 核心查询接口参考

官方仓库：[打开上游](https://github.com/parallaxsw/OpenSTA)。

门级网表与时序分析工具；不处理 RTL 行为语句，时序引擎本身不在参考范围。

- [include/sta/Network.hh](opensta/include/sta/Network.hh)
- [include/sta/NetworkClass.hh](opensta/include/sta/NetworkClass.hh)
- [include/sta/ConcreteNetwork.hh](opensta/include/sta/ConcreteNetwork.hh)
- [include/sta/HpinDrvrLoad.hh](opensta/include/sta/HpinDrvrLoad.hh)
- [include/sta/PatternMatch.hh](opensta/include/sta/PatternMatch.hh)

### naja — 核心身份模型参考

官方仓库：[打开上游](https://github.com/najaeda/naja)。

门级/结构网表数据库；优化与编辑功能不在第一版范围。

- [src/nl/netlist/snl/SNLPath.h](naja/src/nl/netlist/snl/SNLPath.h)
- [src/nl/netlist/snl/SNLOccurrence.h](naja/src/nl/netlist/snl/SNLOccurrence.h)
- [src/nl/netlist/snl/SNLBusNetBit.h](naja/src/nl/netlist/snl/SNLBusNetBit.h)
- [src/nl/netlist/snl/SNLEquipotential.h](naja/src/nl/netlist/snl/SNLEquipotential.h)
- [src/nl/netlist/snl/SNLUniquifier.h](naja/src/nl/netlist/snl/SNLUniquifier.h)

### slang-netlist — 核心前端适配参考

官方仓库：[打开上游](https://github.com/jameshanlon/slang-netlist)。

独立工具，其图节点不是本项目的对象身份；作为 Slang 适配层写法参考。

- [README.md](slang-netlist/README.md)
- [include/netlist/NetlistGraph.hpp](slang-netlist/include/netlist/NetlistGraph.hpp)
- [include/netlist/NetlistNode.hpp](slang-netlist/include/netlist/NetlistNode.hpp)
- [include/netlist/DriverBitRange.hpp](slang-netlist/include/netlist/DriverBitRange.hpp)
- [include/netlist/PathFinder.hpp](slang-netlist/include/netlist/PathFinder.hpp)
- [include/netlist/CombLoops.hpp](slang-netlist/include/netlist/CombLoops.hpp)
- [include/report/ReportDrivers.hpp](slang-netlist/include/report/ReportDrivers.hpp)

### yosys-slang — 位级降级参考

官方仓库：[打开上游](https://github.com/povik/yosys-slang)。

目的是综合，会改变 RTL 结构；只参考位映射的求值方式。

- [README.md](yosys-slang/README.md)
- [src/slang_frontend.cc](yosys-slang/src/slang_frontend.cc)
- [src/lvalue.cc](yosys-slang/src/lvalue.cc)
- [src/addressing.cc](yosys-slang/src/addressing.cc)
- [src/builder.cc](yosys-slang/src/builder.cc)
- [src/naming.cc](yosys-slang/src/naming.cc)

### circt — 身份与实例图参考

官方仓库：[打开上游](https://github.com/llvm/circt)。

基于 MLIR 的编译器基础设施；只参考数据建模，不引入依赖。

- [include/circt/Support/InstanceGraph.h](circt/include/circt/Support/InstanceGraph.h)
- [include/circt/Dialect/HW/HWInstanceGraph.h](circt/include/circt/Dialect/HW/HWInstanceGraph.h)
- [include/circt/Dialect/HW/HierPathCache.h](circt/include/circt/Dialect/HW/HierPathCache.h)
- [include/circt/Dialect/HW/InnerSymbolTable.h](circt/include/circt/Dialect/HW/InnerSymbolTable.h)
- [include/circt/Dialect/HW/InnerSymbolNamespace.h](circt/include/circt/Dialect/HW/InnerSymbolNamespace.h)

### sprotty — 图投影分层参考

官方仓库：[打开上游](https://github.com/eclipse-sprotty/sprotty)。

通用图形框架；是否作为生产依赖在设计阶段决定。

- [README.md](sprotty/README.md)
- [packages/sprotty-protocol/src/model.ts](sprotty/packages/sprotty-protocol/src/model.ts)
- [packages/sprotty-protocol/src/actions.ts](sprotty/packages/sprotty-protocol/src/actions.ts)
- [packages/sprotty-protocol/src/diagram-server.ts](sprotty/packages/sprotty-protocol/src/diagram-server.ts)
- [packages/sprotty-elk/src/elk-layout.ts](sprotty/packages/sprotty-elk/src/elk-layout.ts)

## 补充资料

- [yFiles Logic Gates](https://www.yfiles.com/demos/showcase/logicgates/)：商业 SDK 的公开交互示例，仅记录入口，未下载 SDK。
- [UHDM](https://github.com/chipsalliance/UHDM)：可作为后续多前端导入器参考，本轮未下载。
- [OpenDB](https://openroad.readthedocs.io/en/latest/main/src/odb/README.html)：持久对象身份与数据库机制的补充参考，本轮未下载。

## 维护本地参考版本

本轮快照由 `projects.lock.json` 的完整提交 SHA 标识。先在固定版本上记录研究结果，避免阅读过程中上游更新改变接口。参考源码尚未复制到旧项目，也未被注册为其依赖。

以下命令仅检查已下载源码（在本目录执行）：

```sh
git -C d3-hwschematic rev-parse HEAD
git -C d3-hwschematic status --short
git -C d3-hwschematic fsck --connectivity-only --no-dangling
```

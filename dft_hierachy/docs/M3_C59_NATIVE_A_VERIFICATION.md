# M3 C59 取消测试：A 原生整合交接

## 对象与结论

Agent A，2026-10-11，主树 `m3`。起始02825d4，最终固定集成
**`5bd4b46fd8b81ffda973a6e648e3acfeceb8f138`**；生产实现仍为
`061d1d17e147d3c468ef94a8c5ee2e7ae6563317`，DESIGN SHA-256仍
`487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`。

**新增两项 source_sort 已原样进入原生门禁，三个 observer ON 配置实际运行通过；
标准脚本完整三配置通过，普通构建已恢复 OFF。** C 已正式关闭C-58/C-59并认可新增
机制；B 的固定1410407独立外部验证已经交付。本报告是A的新固定集成验证，不能
冒充B/C执行或由此自行宣布整个M3验收。当前无新待修产品缺陷。

逐命令、退出码、测试统计、配置、编译宏、文件/日志/二进制哈希见
[机器证据](m3_c59_native_a_verification.json)。B独立证据见
[C59报告](M3_R3_C59_VERIFICATION.md)和[公开修复复验](M3_R3_FIX_REVERIFY.md)。

## 实现内容与兼容

| B 原提交 | 原样吸收到主树 |
|---|---|
| 3116a75 | 1fb979a |
| 932bc71 | c139301 |
| f5d3d7d | 43e6854 |
| dd8fbf9 | 4975223 |
| 76dce23 | c2aa586 |
| 9422ead | 6dc1863 |

- `core/tests/unit/M3SourceSortTest.cpp`：B两项/72场景，769/2305声明及513声明×12数组，
  shared/per、cache0/64MiB，段内取消、无发布/半页、冷重建/热查询、数值排序及变页并集。
  B的类型适配已随提交吸收；A未改输入、阈值、断言或刺激。
- `core/tests/m3/CMakeLists.txt` 与 `independent_api/CMakeLists.txt`：原样吸收的原生及
  外部目标登记，PRIVATE链接同宏归档。新增原生目标为 `b_m3_source_sort`。
- `check.sh`：显式普通OFF、Debug/ASan ON，修复新检出/已有缓存决定是否执行observer
  的门禁缺口；`docs/VALIDATION.md`同步更新。没有新增脚本选项。
- 更新A自有计划和适配说明，引用C正式关闭与B独立交付事实；保留早期红基线/历史报告。

本轮不改M0–M3生产代码或既有业务行为，公共API/ABI、JSON/IPC、schema6/protocol2、
配置字段/插件/工程格式无变动，没有新增生产依赖。`git diff 061d1d1 HEAD --`生产目录
为空；B最终9422ead与主树的unit/m3/fixture目录diff为空。用户已有共享日志和协调计划保留。

## 实际命令与结果

目录为仓库根，macOS arm64，Node v24.21.0；任务runner
`python3 /tmp/hier-a-c59-native-run.py`退出0，保存每步实际argv与返回码。

先执行普通ON专项（同目录串行重编，切回OFF前归档）：

```sh
cmake -S core -B core/build -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_TEST_M3=ON -DHIER_TEST_OBSERVER=ON
cmake --build core/build --target b_m3_observer b_m3_source_sort -j4
ctest --test-dir core/build -R '^b_m3_(observer|source_sort)$' --output-on-failure
```

三条均退出0；实际 **2/2 CTest**，B observer **8/285**、source_sort **2/3411168**。
本普通ON阶段仅构建/执行这两个原生目标，不称普通ON完整构建/全量CTest。
此阶段的归档保存在 `/tmp/hier-a-c59-native-release-on-*`，随后不会用OFF日志覆盖。

再执行显式配置后的完整标准门禁：

```sh
PATH=/Users/jiangbowang/.npm-global/bin:$PATH JOBS=4 ./check.sh
```

退出 **0**，总199.11s，所有构建目标与实际CTest均完成：

| 配置 | observer | 完整CTest | CTest用时 | B API合计 |
|---|---|---|---|---|
| RelWithDebInfo | OFF | 64/64 | 15.36s | 57用例/139229断言 |
| Debug | ON | 67/67 | 40.55s | 67用例/3550682断言 |
| RelWithDebInfo+ASan/UBSan | ON | 69/69 | 125.04s | 67用例/3550682断言 |

三个ON阶段的source_sort均 **2用例/72场景/3411168断言通过**。实际命令未带用例过滤，
执行全部冻结场景；日志记录用例及断言总数，72为冻结循环场景数，不虚称保存了每个成功断言XML。
ON两次完整运行中的B API为原公开57/139229＋原observer8/285＋新source_sort2/3411168。
原88CLI在三套完整CTest内全部执行通过；前序M1/M2、共享/资源/分层回归保持通过。
A source各4/566、A observer ON两套各8/305，单列为A自测。
ASan两项故意错误控制按预期检出，无正常产品新增sanitizer错误。

保存并核对各阶段CMakeCache与compile_commands：DB/Core及相应observer测试目标同宏，
Frontend/protocol/app不传播；普通最终OFF，Debug/ASan最终ON。
严格-Werror通过，没有新增C++编译警告；已有同类重复静态库链接警告保留。

其余实际检查：

```sh
PATH=/Users/jiangbowang/.npm-global/bin:$PATH npm --prefix web run test:independent
git diff --check
bash -n check.sh
```

- `check.sh`内的web类型、分层和五个违规控制通过。
- 独立web退出1：11项中**1通过、10项M4/M5未实现失败、0skip**；本轮实际重跑，未改web/锁文件。
- diff空白、shell语法、机器证据JSON和本地文档链接检查通过。没有仓库级C++ formatter，
  不宣称执行了不存在的格式门禁；冻结CPP保持B原样。

## 独立交接与限制

- **B重点：** 核对固定5bd4b46包含自己原样冻结，复核原生两项在三个ON配置的登记/执行；
  已有独立外部结果与A原生整合证据分别保留。给出M3整体收尾所需的最终结论。
- **C重点：** 核对测试PRIVATE依赖、标准脚本显式OFF/ON选择及新固定集成与061d1d1生产代码
  一致，保持已关闭的C-58/C-59事实；无需把原生整合当作新产品修复重新编号。
- **协调收尾：** source与observer的实现、机制审查、独立冻结/执行、A原生整合均已有对应
  交接；完整M3状态由最终收尾确认。本轮不进入M4，也不擅改协调者计划。
- 本轮没有新的真实设计运行、Linux/Windows、远端CI、TSan、fuzz/mutation、分配故障注入。
  生产代码未变，真实设计证据仍属于此前061d1d1报告，不混记为本轮执行。
  事件不覆盖所有移动/析构/分配或OS等待，不承诺M7绝对资源/延迟。
- 当前集成为CLI→Core；NDJSON/Electron/UI属后续阶段。V1排除会话持久化，旧工程
  加载/迁移测试不适用。

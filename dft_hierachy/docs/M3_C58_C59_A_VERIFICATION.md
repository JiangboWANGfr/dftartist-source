# M3 C-58 / C-59：A 修复与验证交接

## 固定对象与结论

2026-10-11，Agent A，主树 `m3`。固定产品
`061d1d17e147d3c468ef94a8c5ee2e7ae6563317`，起始 HEAD `149a20a`，
DESIGN SHA-256 `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`。
随后原样吸收 B observer，最终集成对象
`14104075e3cd03a025eeb757191c4c9fb5adec8d`；生产实现与 061d1d1 相同。

两项修复及 A 验证完成；**C-58/C-59 正式关闭、新整理事件机制认可和 B 独立复验仍待交接，
不宣布完整 M3 验收。** 本报告中的执行均为 A，不归作 B/C 的独立结果。
逐测试命令、计数、输入/日志/二进制哈希见
[机器证据](m3_c58_c59_a_verification.json)，实现计划见
[ExecPlan](plans/M3-source-review-fixes.md)。

## 实现与兼容

- `1099031`：L1 `Sources.cpp` 用设备号/inode 合并物理文件身份；已读规范路径按字典序
  遍历，首个别名作为显示路径，所有缓冲映射相同 FileRef。独立文件不因字节/hash 相同合并。
  `Frontend.cpp` 将身份读取失败转为稳定 bad_request（含路径及系统原因），不忽略错误。
- `061d1d1`：L2 `SourceIndex.cpp` 每次排序比较/去重谓词检查 Cancel，借助局部私有
  中断退出标准算法；被打断的容器只销毁，索引未完成不发布。两个私有观察事件详见
  [具体适配](M3_OBSERVER_PROPOSAL.md#c-59-整理段增量c-已认可)。
- A 新增 1024 声明的大宏组 fixture 和回归；排序/去重第 257、769 次事件同步停止，
  验证 cancelled、无发布/命中物化、cache0 冷重建及热查询完整有序 1026 命中。
- B 冻结原样吸收：`624c09d → 757b886`、`14c869f → f58971f`、`ecc606b → 9c6dcdc`、
  `ec2ecf1 → 4202870`。其七项新增公开 API 用例随 B 的 CMake 登记进入默认门禁。
- 原 observer 独立测试与报告原样吸收：`f468aa8 → a879f47`、`f8a4883 → 822d98a`、
  `1a7933d → 1410407`。B 的历史三配置结果针对旧产品 3c2bdd2；本次 A 重跑结果如下。

修正的是本轮 M3 的文件表和索引行为；M0–M2 事实、依赖、方向语义不改。
公共 C++ 头/ABI、JSON/IPC、schema6/protocol2、配置、插件、工程格式均无新变动，
没有新增第三方依赖。FileRef 是快照内不透明编号，修正别名去重可能改变新快照编号；
不存在跨快照持久化编号承诺。私有 observer 的 ON/OFF 对象必须一致重编。

## 实际执行

目录均为仓库根，macOS arm64；Node 使用 `/Users/jiangbowang/.npm-global/bin/node`
v24.21.0。完整门禁实际命令：

```sh
PATH=/Users/jiangbowang/.npm-global/bin:$PATH JOBS=4 ./check.sh
```

在吸收 B observer 前后各执行一次，都退出 **0**；实际展开为三次配置/完整构建（`cmake --build core/<build> -j4`）和
`ctest --test-dir core/<build> --output-on-failure -j4`，HIER_TEST_M3 全部 ON。

**最终集成 1410407**（原生 B observer 仅 ON 配置登记）：

| 配置 | observer | 完整 CTest | CTest 用时 | B API 合计 |
|---|---|---|---|---|
| RelWithDebInfo | OFF | 64/64 | 18.15 s | 57 用例 / 139229 断言 |
| Debug | ON | 66/66 | 37.24 s | 65 用例 / 139514 断言 |
| RelWithDebInfo + ASan/UBSan | ON | 68/68 | 133.13 s | 65 用例 / 139514 断言 |

ON 各新增 B observer **8 用例/285 断言**，A observer 保持 8/305；其余集合保持通过。
本次未将普通生产配置改为 ON，不能称 A 在最终集成对象执行了三套 B observer。
新 C-59 事件尚不在这八项独立 oracle 内。最终完整日志
`/tmp/hier-a-c58-c59-observer-check.log`，逐配置归档见机器证据 `observerIntegration`。

**此前固定实现 061d1d1**（原日志保留，未覆盖）：

| 配置 | observer | 完整 CTest | CTest 用时 | B 原 CLI | B 12 套 API |
|---|---|---|---|---|---|
| RelWithDebInfo | OFF | 64/64 | 16.15 s | 88/88 | 57 用例 / 139229 断言 |
| Debug | ON | 65/65 | 34.02 s | 88/88 | 57 用例 / 139229 断言 |
| RelWithDebInfo + ASan/UBSan | ON | 67/67 | 123.88 s | 88/88 | 57 用例 / 139229 断言 |

每配置包含原 API 15/102083、原九套 API 35/34828、新 source 5/2225、物理身份
2/93；无 skip。A source 各 4/566，A observer ON 两配置各 8/305。
前序 M1/M2、分层/资源回归在完整集合内；ASan 的两项故意错误控制按预期检出，
正常产品无额外 sanitizer 报告。现有 -Werror 编译通过，没有新增 C++ 编译警告；
已有同类重复静态库链接警告保留，不宣称零告警。

定向修前/修后命令：

```sh
cmake --build core/build --target b_m3_source_increment b_m3_source_physical -j4
ctest --test-dir core/build -R '^b_m3_source_(increment|physical)$' --output-on-failure
cmake --build core/build-debug --target hier_observation_tests -j4
core/build-debug/tests/hier_observation_tests '[a-m3-observer]'
```

C-58 修前 CTest 退出8：hard=1 返回两项 FileRef，物理身份测试 92 断言成功/1失败，
1 用例成功/1失败；修后 2/2 CTest 退出0。Debug observer 8/305 退出0。
首次未重配新目标的构建退出2、A 自测误移动 const unique_ptr 的编译退出2均保留，
分别通过重配目标及使用 Result::value 修正，不改 B 预期。日志路径和哈希在机器证据。

### 真实设计与 Web

`python3 /tmp/hier-a-c58-c59-real-smoke.py` 退出0，实际 10 条独立 CLI 命令全部0；
完整 argv 保存在机器证据 `realDesigns.runs`：

- NX9000 / OpenC910 各执行 `source i:0 --kind definition`、`read-source <表内 FileRef>`、
  `check-inputs`、`verify-facts`，都传各自 `-f <filelist> --top <top>`。
  Python 对原磁盘字节核对 SHA-256、半开 offset、原文读取及空 changed。
- NX9000 另外 `resolve-source <FileRef> --line <行> --col <列> --limit 1`，验证一项和 next；
  `verify-sharing` 比较 324 实例、17 共享体/122 逐实例体，different=0/failed=0。
- NX9000 facts：Slang 306/self 597/mismatched=0；OpenC910：Slang 42728/mismatched=0。
  真实输入只读；OpenC910 仅使用构建目录既有 gen_rtl 链接。

`check.sh` 内 `npm run check` 的 TypeScript、分层及五个违规控制全部通过。
另执行 `PATH=/Users/jiangbowang/.npm-global/bin:$PATH npm --prefix web run test:independent`，
退出1：**11 项中1通过/10失败/0skip**，仍是 M4 client 八项、M5 selection 两项未实现；
版本契约项通过。没有改 web 或把这组失败称为通过。

`git diff --check` 退出0；`git diff 4202870 HEAD -- core/tests/m3 core/tests/unit core/tests/fixtures/m3`
在首轮固定061d1d1时为空。最终集成的
`git diff 1a7933d 1410407 -- core/tests/m3 core/tests/unit core/tests/fixtures/m3` 为空，
证明与 B 最终冻结一致；生产目录相对061d1d1也为空。公开头/协议/CLI/web/DESIGN 本轮未改。
C++ 没有仓库级 formatter，按相邻风格检查，不冒充执行了不存在的格式工具。

## 限制与独立交接

- **B：** 已领取061d1d1公开修复复验；继续三配置硬/软链接、相同内容独立文件和既有 source/step/trace。
  原 observer 八项已按 B 自己的刺激修订和报告原样整合；C 认可新增两事件后，独立补同范围大组排序/去重
  中途停止、≤256 候选检查、不发布及重试无漏重。不要冻结 std::sort 精确比较总数。
- **C：** 审查物理身份、代表路径/编号顺序、全部别名缓冲归并和身份失败传播；审查
  两新增事件与生产检查的准确位置、标准算法中断后的局部所有权及 OFF 行为。由 C 关闭意见。
- 本轮未执行 Linux/Windows、远端 CI、TSan、fuzz/mutation、分配/stat 失败注入。
  使用现有 macOS/Linux POSIX stat；未声称 Windows 支持或 Linux 已实跑。
  编译期间并发修改文件不具备 OS 原子快照保证；取消粒度也不等于墙钟等待上限。
- 当前集成是 CLI→Core，NDJSON/Electron/UI 为后续里程碑；首版排除会话持久化，
  旧工程加载/迁移测试不适用。用户已有日志与协调计划修改保持，不夹带提交。

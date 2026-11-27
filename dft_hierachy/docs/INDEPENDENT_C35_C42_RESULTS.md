# Agent B：C-35～C-42独立回归记录（2026-10-10）

## 固定快照与预期来源

- 修改前M2：`6518f80508d4911d22f0a2bc3e46cbe46dabb985`。
- 修复交付：`a6b3c8dd906a16c94ab7af5e5dc278e9e95406f1`。
- 新测试冻结：`6cfdadf`；`b7b4e11`仅修复Python缩进；`0987827`在检出修复版本前
  取消一个未被契约定义的blackbox方向返回假设。最终冻结18个Python方法+4个C++用例。
- 旧52方法保持`1502f4c`原断言；计入本轮共70个Python方法，无skip/expectedFailure。
- 内部mutation适配`d42d4c4`只增加固定head/source SHA白名单，三个故障与退路预期不变。
- 输入/逐位预期来自正式DESIGN 4.4、4.6、5.3、5.4和C公开HDL反例，见
  [INDEPENDENT_TEST_PLAN.md](INDEPENDENT_TEST_PLAN.md)末节及测试注释。
  没有查看A修复源码/diff或运行A自测来制定预期，未将A的结果当作独立证据。

在B拥有的detached `dft_hierachy-b-verify`工作树，先验证旧快照，再重新固定到修复
快照并重建Release/Debug/ASan+UBSan。依赖源码锁定不变，只复用第三方构建产物。
独立C++用例通过临时测试登记适配链接公开库，fixture始终来自B测试树；无产品修复。
旧release/ASan CLI另存`hier-pre-c35-fixes`，不会误用新二进制证明修改前红测。

## 修改前M2红测

| 基线 / 测试 | 独立结果 |
|---|---|
| Release，最终18个Python方法 | 2方法通过、16方法失败；138个subTest断言失败，0error/0skip，退出1 |
| ASan/UBSan，最终18个Python方法 | 同上；无意外崩溃/sanitizer报告 |
| Release / ASan，4个C++ API用例 | 各2通过、2失败；293断言中13失败，退出42 |

通过的Python控制为输入合法性（19个top×两模式、errors=0）和等宽输出拼接位对应。
16个失败方法对应所有8项C问题，其中截断高位负载也发现旧实现遗漏转换语义。
C++的无库/有库命名连接通过，无库/有库位置连接失败；无库用例在首个模式的REQUIRE
中止，其逐实例深层断言未执行，不将未执行的断言算作被验证。

最初未复核blackbox歧义时得到142次失败；该数字不作为最终冻结的红测计数。
Python初次启动的缩进错误和Debug测试适配未重新配置导致的目标缺失，均是harness问题，
已经修正；不是产品缺陷，不能记为有效红测。

## 修复后独立执行

| 配置 | Python旧52+新18 | C++公共API | 原有CTest |
|---|---|---|---|
| Release | 70/70，14.382s | 原18/1343断言+新4/376断言通过 | 16/16 |
| Debug | 70/70，25.012s | 原18/1343断言+新4/376断言通过 | 16/16 |
| ASan/UBSan | 70/70，132.522s | 原18/1343断言+新4/376断言通过 | 16/16 |

四项输出mutation重新执行：array_occurrence、precision、multi_driver、hier_ref均被
独立旧断言捕获，control先通过且有真实注入audit，runner退出0。仅证明断言敏感性。
三项验证前生成事实mutation在修复快照上重新执行并全部通过：漏data Dep、漏完整写
目标均触发mismatched>0和非零退出，重建y/z全部目标的conservative/all依赖并保留
clock/async；删除init事实触发自检失败，proc和相关连接查询partial/unsupported。
每项finally恢复源SHA、删除精确的Connections.cpp.o后重建，再确认mismatched=0。
注入点只读了唯一生成事实→验证边界附近8行，没有用A实现重新制定oracle。
最后恢复后再次运行70项Release测试：70/70，14.465s。测试登记适配也已恢复，
隔离实现树git status为空；A工作树、旧工程、参考仓库和真实设计均未修改。

## 修复快照的独立真实设计回归

Release与ASan/UBSan均独立重跑以下全部项，计数一致，退出0；无sanitizer报告。

| 设计 | verify-sharing：实例/共享body/逐实例body | different/failed |
|---|---|---|
| processor_core | 324 / 17 / 122 | 0 / 0 |
| openC910 | 15848 / 503 / 15848 | 0 / 0 |

| 设计/模式 | slangCompared | selfChecked | skippedExternal | mismatched |
|---|---:|---:|---:|---:|
| processor_core/shared | 306 | 597 | 0 | 0 |
| processor_core/per-instance | 562 | 737 | 0 | 0 |
| openC910/shared | 42728 | 0 | 0 | 0 |
| openC910/per-instance | 296867 | 0 | 0 | 0 |

不把skip=0的真实设计当成层次引用覆盖；该路径由KAT验证。回归输入filelist与
环境映射沿用INDEPENDENT_M2_RESULTS所列路径；这里只复用输入，不复用旧通过结果。

修复快照源码/本机二进制SHA-256：

- Connections.cpp：`f3ad66101215ef2dfec35b4f2a8eea558705ee77127dd3eaf4ea2fba29e68ce4`
- 恢复后Release hier：`fe9f61414fa6a2aefdc635118de2d652a4bfd3275449238a39e2ca1644344eee`
- Debug hier：`ae4d803a41c98e850ed0e8de9a184da508ddf78b19254ff43398f6e2da9ab1c4`
- ASan/UBSan hier：`96a1a78edb5b7b0c0a501c5939fdec1378750f8e5835607adf66eee695a326a8`

## 规范歧义与结论边界

无库引脚方向unknown且宽度已知时的连接查询具体端点/reason尚未完整定义。
新测试仅拒绝空且complete，保留逐位置身份与位映射强断言；不认定方向识别已经验收。
Linux、覆盖率、TSan、M7性能/资源预算和后续UI/协议里程碑未测试通过。
这是B独立KAT与回归证据；C-35～C-42的正式关闭及M2最终放行仍由C复核。
B未发现本冻结集合中的未修复产品失败；不把有限集合全绿解释为所有合法HDL已穷尽。

## 复现

从B测试树`core/tests/m2`，HIER_BIN指向B自行重建的固定修复快照：

```sh
HIER_BIN=/absolute/path/to/b-verify/core/build-b/hier python3 -m unittest -q test_deps test_pins test_conn test_verify test_contract test_boundaries test_review_edges
HIER_BIN=/absolute/path/to/b-verify/core/build-b/hier python3 run_mutations.py
```

将HIER_BIN切换为build-b-debug/build-b-asan即可复跑；C++ `b_review_api`链接同一套
公开库，HIER_FIXTURES必须指向B的core/tests/fixtures。正式合入测试后CMake已有登记。
独立内部mutation命令与恢复条件见[INDEPENDENT_M2_RESULTS.md](INDEPENDENT_M2_RESULTS.md)，
该runner已允许精确的旧/修复快照及源SHA，拒绝任意其他head。期间勿并发构建同一源。

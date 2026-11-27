# M4 wire Schema 与生成产物

状态：2026-10-12，C60～62及公共客户端生命周期已获C认可；TS生成器/客户端已通过B对应子集复验；Core服务端已实现，独立运行时验收仍待交接。公共行为依据
[DESIGN §5.6](../../docs/DESIGN.md)，
执行状态见 [M4 计划](../../docs/plans/M4.md)。

`hier.schema.json` 是手工按契约编写的 JSON Schema 2020-12，是 wire 结构的唯一机器来源。
它不是从当前产品输出生成的，也不由 A 自检产生 B 的 oracle。当前Core、Schema和TS客户端均为protocol2/schema7；
Core已提供SnapshotInfo增量与serve，保留旧CLI命令和C++入口。
机器文件的draft注解保留已冻结字节；实际实施/评审状态以REVIEW_LOG和本计划为准。

## 结构与使用

- 根定义是 ClientFrame 或 ServerFrame；分别验证两个方向时应使用对应 `$defs`。
- `$defs` 包括模型、参数、结果、事件、错误、范围、字段默认值和条件分支。
- `x-hier-contract` 引用协议/模型版本；`x-hier-methods` 登记全部27个方法的 params、result、
  成功 response、客户端方法名、allowsPartial 和 cacheComplete。`response` 只验证成功响应，
  错误响应统一使用 Failure。
- 收到成功响应必须根据 pending method 选择对应 response 定义。通用 Success 的结果类型并集
  只用于帧形状检查，不能证明结果属于所请求的方法。
- 引用是不透明字符串；结构验证不解析引用身份。扩展字段保留可接受性，已知判别字段和变体排斥规则
  按 DESIGN 验证。空字符串、null、缺失分别处理。
- `default` 是注解，不会由 JSON Schema 自动填入。生成器和边界实现须复用定义的默认值，
  不得假定 validator 会修改请求。`date-time` 必须启用 format 检查并结合 UTC 毫秒格式约束；
  只运行 meta-schema 或默认的 format 注解模式，不能验证日期有效性。

## A 的结构自检

从仓库根目录执行；以下依赖仅用于 Schema 检查，不加入生产 CMake/npm 依赖：

```sh
python3 -m venv /tmp/hier-m4-schema-check
/tmp/hier-m4-schema-check/bin/python -m pip install -r protocol/schema/tests/requirements.txt
/tmp/hier-m4-schema-check/bin/python protocol/schema/tests/check_schema.py
/tmp/hier-m4-schema-check/bin/ruff format --check protocol/schema/tests/check_schema.py
/tmp/hier-m4-schema-check/bin/ruff check protocol/schema/tests/check_schema.py
node protocol/schema/tests/check_patterns.mjs
```

测试使用手写对象检查 meta-schema、本地引用、27个方法的请求/成功/错误/完整性，以及版本、
字段省略、数值、日期、分页、源码、表达式、端口变体和 M2 route / M3 Hop 的区别。
Hop检查按kind覆盖后继上限、空后继终点、已知引脚位置及side，未知宽度unresolved不强造at。
`pattern_cases.json`是A手写的共同输入，Python结构检查与Node原生RegExp分别运行；
覆盖全部三个pattern的合法值、LF/CR/CRLF/Unicode分行符等后缀。Node命令只检查pattern，
不冒称完整TS验证器或日历有效性检查；Node版本须符合web的engines（本轮使用24.21.0）。
字符串结尾使用`(?![\s\S])`，不依赖两种正则引擎对`$`的不同尾换行处理，也不trim输入。
有意保留方法层的空集合样例；这些不是所有模型组合或业务语义的穷举。
不运行产品、不改 B 测试，不能作为独立冻结、C++/TS 一致性或 M4 验收。

## Schema 以外仍须验证

以下由受审实现、边界语义检查及 B 独立测试覆盖，不能由一份 JSON 的结构验证推出：

- 原始 UTF-8、重复键、分帧、长度/深度、EOF；普通 JSON 解析后的对象已丢失部分原始信息。
- hello 顺序/次数、递增 id、pending 方法/连接/快照关联、恰好一次、取消与关闭竞态。
- 跨字段关系，如 progress.done≤total、topCandidates 的成员/顺序、位段越界、四态值宽度、
  来源坐标的先后、graph/fact 的引用一致性，以及引用是否属于当前设计。
- inputHash 捕获是否完整、源文件哈希正确性、索引/查询语义、partial reason 的真实原因。
- TS 生成可复现、C++/TS 对独立输入的接受/拒绝一致、资源/线程回收与旧 CLI 回归。

没有会话持久化格式，因此 schema6 旧握手的明确拒绝属于 wire 版本兼容测试，不是工程迁移。

## TypeScript 生成和重放

```sh
npm --prefix web run generate:protocol
npm --prefix web run check:generated
HIER_SCHEMA_PYTHON=/path/to/python-with-jsonschema npm --prefix web run test:schema
npm --prefix web run test:client
```

生成入口为`web/scripts/generate-protocol.mjs`，输入仅本Schema。输出位于
`web/packages/protocol-types/src`：wire类型、27方法映射、展开引用并合并同级约束的参数描述、
195个AJV standalone校验器和运行辅助代码许可。生成文件记录输入SHA，禁止手改；
check模式在内存重新生成并逐字比较，不覆写差异文件，已接入web check。
类型生成工具不能静态表达全部if/then跨字段条件，因此客户端仍逐帧/逐方法运行结构验证。

生成工具版本由package-lock固定；AJV编译器只在开发时执行，esbuild将所需运行辅助代码
打包进浏览器ESM，无运行时eval/Function或Node依赖。参数默认值来自Schema；引用旁的额外
约束与被引用字段合并，不能覆盖丢失TracePoint.slice.ref/bits。条件分支不能引入未支持的
形状/默认值，遇到这些新Schema形态生成器应失败，再显式扩展。date-time执行Gregorian UTC
毫秒日历检查，与独立Python oracle一致；year0/闰秒字符串不作为openedAt成功值。

`test:schema`原样调用B的Python corpus，再对569个输入运行生成校验器，对86项登记/默认值
检查实际生成metadata；另验27个正例params规范化后仍合法、幂等且不改原输入。
这是A的跨实现重放，不替代B新验收，也尚不是C++ decoder与TS的完整一致性。

## C++ 生成和服务端

```sh
python3 protocol/schema/scripts/generate_cpp.py
python3 protocol/schema/scripts/generate_cpp.py --check
cmake -S core -B core/build -DHIER_TEST_FUTURE=ON
cmake --build core/build -j 8
ctest --test-dir core/build -L M4 --output-on-failure
HIER_BIN="$PWD/core/build/hier" npm --prefix web run test:core
/path/to/python-with-jsonschema protocol/schema/tests/check_cpp_corpus.py
```

C++生成器仅使用Python标准库，读取同一Schema，输出私有`WireSchema.generated.cpp`：
195个定义校验、27方法登记和参数默认应用。未知Schema关键字/不支持形态直接使生成失败。
当前三个ASCII正则在生成时编译为字符集合/重复范围，运行时线性匹配且要求完整消费字符串。
生成器只支持绝对锚定的ASCII拼接、字符类及固定次数/`*`/`+`；需要回溯的重叠重复或其他语法
明确拒绝。`a_m4_cpp_generator_guard`验证不能静默扩展该子集；不在C++维护另一套业务正则。
构建无需下载新的JSON库；CTest的`a_m4_cpp_generated`验证生成零差异。原始字节由生产
FrameReader/decodeFrame检查，结构校验使用唯一owned JsonValue，数字保留十进制token，
以精确数值检查整数/安全范围，不经double舍入。B的569结构输入已由A在两种生成器上重放；
86项TS登记检查不冒称C++原始decoder验收。
原先Node接受而C++拒绝孤立代理转义的差异已按DESIGN §5.6.2修正：所有wire字符串
（含键/未知字段）必须为Unicode标量序列。C认可策略后，B在347b73c/b4478d1冻结原始
字节/JS出站/自定义Transport正反例，A在feec205实现共同标量检查。合法代理对、NUL、
真实UTF8和组合字符保留，不规范化、不替换修复。B原655结构corpus不包含此raw边界；
新增边界集合的A执行与B/C独立验收分别记录，不据有限用例宣称所有字节串等价。

Node保留原始数字中非整数被JavaScript舍入为整数的位置，在私有校验视图中拒绝这些值；
同一生成Schema决定已知字段约束，具体pending方法的响应也检查该证据。合法`1.0`/`1e0`
仍接受；未知扩展和error.data中的数值保持原JSON.parse结果。元数据不进入公开wire对象，
不新增第二套字段表或公共Transport接口。原始token验证与结构corpus分别报告。

`serve`将结构/ID/快照检查留在I/O边界，查询在唯一worker持有的Design上执行；
参数默认来自生成器。结构合法但无效的引用/位段/游标交Core处理，完整性由Core上传。
输出使用安全整数模式，旧单次CLI仍支持原C++整数范围。schema7的ClockEvent按Schema
省略只属于AsyncEvent的type；schema6曾多写的clock.type不再输出，需要依赖旧形状的
消费者随schema7重建/适配，新客户端明确拒绝旧schema6握手。

输入哈希为L2的`hier-input-v1`长度前缀编码摘要：前端身份、原设计参数、展开源文件顺序、
已捕获defines/undefines/显式tops、按规范路径排序的实际文件字节摘要，以及查询到的库cell
与pin/属性事实。列表保序、map排序；不包含snapshotId/时间/缓存容量/共享模式。
文件bytes来自Slang打开时保存的缓冲，未在L4或哈希时重读磁盘。当前Slang API不能完整提供
嵌套filelist的全部有效选项/环境展开，所以这类输入始终inputHashComplete=false；已捕获
内容仍参加哈希。不透明LibraryProvider也为false，不以对象地址冒充完整库身份。
完整性为false的摘要不能用作跨打开编译结果复用的充分凭据。

stdio实现面向现有macOS/Linux平台，采用非阻塞POSIX读写，保存部分写的字节位置；
输出阻塞时停止继续读输入。状态最多768输出记录（含预留），不限制单个合法大响应的字节。
I/O使用10ms poll间隔重新观察worker输出/管道关闭，空闲时不会因stdout可写而忙转；该周期不是
取消延迟SLA。Slang打开/提取和系统边界仍不可强制中断，关闭等待真实返回和join。
Windows移植、M7全进程预算，以及B/C的新Core独立结论仍须另行验证。

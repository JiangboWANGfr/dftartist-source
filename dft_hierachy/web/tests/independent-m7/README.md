# B M7 独立测试

依据、输入及逐项预期见 `docs/plans/B-m7-independent.md` 和本轮独立报告。
在固定产品上先构建 Core 和 web 公开声明，再显式提供环境；缺能力即失败，不跳过。

```sh
export HIER_B_PRODUCT_ROOT=/absolute/fixed-product
export HIER_BIN="$HIER_B_PRODUCT_ROOT/core/build/hier"
node --test resources.test.mjs demo-config.test.mjs
node verify-types.mjs
```

上述命令从本目录执行；使用受支持的 Node，依赖从固定产品读取。MockTimers 只用于已有
公开计时器，真实子进程仍实际启动/回收。自有 producer 是协议刺激，不是 Core。

`dump-writes.cpp` 只调用公开 Design API，以支持公开 CLI 未暴露的 connectionCacheBytes。
用与固定 Core 相同的编译器和 sanitizer 标志编译，包含 model/query/protocol 的 include，
依次链接构建目录的 libhier_protocol.a、libhiercore.a、libhier_db.a、libhier_frontend.a、
_deps/slang-build/lib/libsvlang.a。然后：

```sh
export HIER_B_WRITE_DUMP=/absolute/owned/dump-writes
python3 dynamic-writes.py
```

6组手写目标×两个真实 occurrence×两种提取模式×两种缓存预算；总计752个目标/位段检查，
另检查枚举/重复写/位映射合法性。旧/新结果与最初单实例版本都保留于本轮证据。

真实 Electron 用例需要 `npm --prefix "$HIER_B_PRODUCT_ROOT/web" run build:demo`，以及一个
已存在的全新空目录 `HIER_B_M7_EVIDENCE`。每次运行换目录，`wx`保护旧原件：

```sh
node --test --test-concurrency=1 electron.test.mjs
node real-design.mjs /absolute/strict-complete-input.f /absolute/new-sdk-report.json
node real-cancel.mjs /absolute/instances-100000.sv /absolute/new-cancel-report.json
```

Electron 打开超限的首个进程是明确的无 Hello 对照 `/bin/sleep`，重开使用真实 Core；
RSS/off 使用真实 Core。公开 spawn 透传记录 PID，沿用 C 已审探针做法，不替换 SDK/模型。
renderer 页面错误、原文和截图/退出均保存；资源可能在包装程序首条指令前被终止。
实时 CPU 取消用例接受协作合法终态或超时整快照升级两种正确路径，记录其他 pending 的结果；
watchdog、实际观察值都不是最坏中断 SLA。

这些是独立 opt-in 测试，不凭它们声称完整 UI、Linux、读屏、远端 CI、香山全设计 sharing
或所有规模容量通过。原 M4 S02 的维护及原字节 pin 存档见共享兼容测试的 history/pre-m7/。

原 compatibility.test.mjs 按 2371d1c 原样保留（SHA256 以本轮结果清单核对）。
S02 的 Node 587 字节 pin 是纯重构约束；B 本轮在 56675f6 原样运行该 S02，1/1 通过，
在 eec80c9 原标准 M4 入口中保留其 1024 != 587 失败。DESIGN §5.6.5 明确新增可选
ProcessResourceLimits/resourceLimits，不属于字节不变的重构。

现行 S02 继续执行原旧/identity 正向及 7 负类型输入，并增加 B 独立 M7 正向/3负输入，
不采用新产物字节/hash 作为 oracle。历史文件为存档，不从本子目录直接执行其相对导入。
原失败与历史回归不删除；本次维护不意味着 Node 的所有行为或整个 M7 已验收。

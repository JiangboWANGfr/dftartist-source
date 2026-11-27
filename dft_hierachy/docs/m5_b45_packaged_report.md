# B-ORCH-45：候选公开包外消费冻结及红基线

本轮只补 B32 明列的完整 tarball / React peer 差额，不重新解释候选 UI 已通过。
固定产品 **e2da1afbd723ea746fe404676dfcf97900fdbf7d**；B 初始 **7a0f805dc6908a3ecde2d8ed07554e4c520e0888**。
先冻结输入，再实际执行；独立 oracle 仅为 DESIGN §6.18.1/6、§6.14.5、原公开声明及手写消费者。
没有读 A 生产实现/diff/聊天/自测形成预期。

## 提交与范围

| 阶段         | 固定 SHA                                 | 意义                                                        |
| ------------ | ---------------------------------------- | ----------------------------------------------------------- |
| 原首冻       | 8e1c759451e7c423f218050bae146ef345047f0f | 9 个新增输入；原始错误和结果保留                            |
| 旧入口校正   | 4094b76a49a33b697bf1baf802123ce269aa50a5 | 删除误写的既有 TreeView 对照，原 SourceView/版本回归保持    |
| 最终测试冻结 | 50c2a8debcc0d84bd69fff3743284bb43d693a4e | TS 标准库来源与 CSS syntax-error 警告边界加固，候选语义不变 |

输入：packaged/cases.mjs、positive.ts、old-positive.ts、assertions.mjs、facility.test.mjs、probes.mjs、run.mjs、README.md 及对应 B45 计划。
本报告/证据 API/可携 JSON 后续独立提交；不改原九个冻结输入及任何旧测试/产品/标准入口/锁。
源审计记录三阶段各九份完整原文，不把校正后的输入回写成首稿。

## 可验证条件、输入与结果

| ID   | 实际输入与规范判断                                                                                                                                                                                  | 最终基线结果                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| PK01 | 在 workspace 外通过原生 ESM import 已安装 @hier/views；§6.18.1/6 要求 SourceCandidatesView 为公开函数；原 SourceView 和版本 2 保留                                                                  | **失败**：缺新运行时出口；旧入口对照通过；只导入、不直接调用组件函数            |
| PK02 | 实际 tarball 公共根声明；strict / exactOptionalPropertyTypes / noUncheckedIndexedAccess / noEmit / skipLibCheck=false；§6.18.1 要求四个新出口、必需 props、闭合 Command 和 unknown/readonly Failure | **失败**：四个新公共名字均 TS2305；旧类型正例零诊断；来源守卫通过               |
| PK03 | 实际安装包公共 @hier/views/source-candidates-view.css 子路径；resolve、consumer 内真实文件、非空及固定 esbuild 无 css-syntax-error 警告                                                             | **失败**：ERR_PACKAGE_PATH_NOT_EXPORTED；尚未执行该产品 CSS 的读取/解析         |
| PK04 | §6.14.5 既有 React peer >=18.3.1 <19 语义范围；严格离线安装、npm ls 与 host/views/react-dom 实际 realpath，同一个非私有 React                                                                       | **通过**：React/ReactDOM 18.3.1，唯一物理 React 安装；不是新组件 hooks 运行证明 |

四项 capability probes：**planned4 / executed4 / passed1 / failed3 / blocked0 / skipped0**，进程 exit1。
这与正式组件缺失时 DOM executed0 的门禁计数不同，不能合并成 UI 运行数。

六个独立类型负例：缺 onCommandError（2741）、className 显式 undefined（2375）、伪 navigation（2740）、写 readonly command（2540）、非法 command（2322）、访问 unknown error.message（18046）。
各自单源，必须只出现该文件的指定语义诊断。类型正例及实际声明来源先行；当前 **planned6 / executed0 / passed0 / failed0 / blocked6 / skipped0**。
缺名字/模块不是负例通过。TS7006 和 TS2344 是缺出口的后续诊断，不另立独立产品缺陷。

## 设施、异常与独立性

Node 设施最终 **21/21**，fail/cancelled/skipped/todo 均 0：

- 四 probe / 六独立负例库存，正例零诊断和缺出口拒绝；
- 精确负例诊断接受，以及缺出口/其他文件/全局/多诊断四类假绿拒绝；
- consumer 路径、前缀碰撞和源路径边界；
- 真 TS Program 的默认标准库接受、真实 typescript.d.ts 拒绝，伪标志/伪目录/标准名不足以绕过；
- 真 esbuild 对合法 CSS 接受；缺闭括号产生实际 css-syntax-error warning，断言拒绝；
- peer 等价写法接受、错误 major/私有或 bundled React 拒绝。

仅真正 program.isSourceFileDefaultLibrary、精确真实 compilerLib 目录及 lib*.d.ts 标准文件名三条件同时满足时豁免工具标准库。
产品与 React 声明必须真实位于 consumer；无 proposal、TS paths、源 alias、NODE_PATH、Node/Electron ambient 或 workspace 产品链接。
实际 old/new publicDeclarations 与全部 TS 输入及诊断原文留存。

四产品与原锁 React/ReactDOM/React 类型的完整本地传递依赖闭包分别打包，共 **12 tarballs**。
消费者在 workspace 外，实际路径含空格/中文，空私有 npm cache、独立空 user/global config。
npm pack/install/ls 均捕获双流/exit；安装 offline、ignore-scripts、strict-peer-deps，未用 force/legacy-peer-deps，未访问网络或发布。
12 pack + 1 install + 1 npm ls 均 exit0；最后真实 consumer child exit1，并向 runner 传播。
每条子命令 30 秒设施 watchdog、maxBuffer 64MiB；不是产品性能/超时承诺。
所有实际 tarballs/install/cache 保留，无自有后台任务。未清除用户文件、未新建定时器或发送其他会话消息。

## 实际命令及证据

E=/private/tmp/hier-b-orch45-packaged.25WO2j；P=E/fixed product 中文，独立 detached 产品。
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree。
N=/Users/jiangbowang/.npm-global/bin/node，PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin。
测试 cwd=B，HIER_B_PRODUCT_ROOT=P、HIER_B_BROWSER_TOOLS=P/web、HIER_B_NPM_BIN=/opt/homebrew/bin/npm。
D=web/tests/independent-source-candidates-view/packaged；包运行另设 HIER_B_PACKAGE_EVIDENCE_ROOT=E。

| B 实际命令                                                 | exit / 秒 / 结果                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| git worktree add --detach P e2da1afb…                      | 0 / 0.536，仅独立 P                                                       |
| npm ci --offline --ignore-scripts，cwd=P/web               | 0 / 0.605，原锁工具                                                       |
| npm run check，cwd=P/web                                   | 0 / 6.572；196 定义/27 方法、tsc -b、54 模块182依赖、7 分层负例           |
| N --test --test-reporter=tap D/facility.test.mjs，首冻     | 0 / 0.070；15/15                                                          |
| N D/run.mjs，首冻                                          | 1 / 3.206；真实 12 包成功，旧 TreeView 输入错误挡住 PK01/02               |
| N D/run.mjs，4094 校正后                                   | 1 / 3.608；真实缺候选出口/类型/CSS，peer 通过                             |
| N --test --test-reporter=tap D/facility.test.mjs，最终冻结 | 0 / 0.290；21/21                                                          |
| N D/run.mjs --list，最终冻结                               | 0 / 0.026；4 probe / 6 负例库存                                           |
| N D/run.mjs，最终冻结                                      | 1 / 3.602；4 执行/1 过/3 失败，6 负例阻塞                                 |
| N E/source-audit.mjs                                       | 0 / 0.320；50 Git 命令/100 完整流、四笔导入及12最终路径、98产物与规范核对 |
| N E/protect.mjs --check，封前                              | 0 / 0.740；原 ordinary/declarations/Core/日志前缀保护                     |

精确 argv/cwd/时间/exit/signal/错误与完整 stdout/stderr 在可携档；格式、提交、封后回读与保护回执在 E。
本轮外层三个非零均为保留的包运行（首次含 B 输入错误），不谎称首次就是产品失败。
Node24.21.0/Darwin arm64、npm10.9.2/semver7.6.3、TypeScript5.9.3、React/DOM18.3.1、@types/react18.3.26、esbuild0.25.11、Prettier3.9.10。

可携档 docs/m5_b45_packaged_freeze.json 包含三次原始包运行、所有真实 tarballs 原字节、嵌套完整双流、原九输入三阶段、公开原入口、来源审计、保护基线和本报告。
evidence.mjs 显式 verifyEvidence/checkEvidenceControls；校验压缩块长度/SHA、实际计数与阶段，不能通过空对象验档。
归档校验正负控制不是再次执行产品测试。封档后结果与 SHA 写共享交接，不递归把自身哈希写入档。

## 旧入口输入错误及加固历史

**B45-INPUT-01**：首稿把 TreeView 当作既有公开出口。修改前公开 dist/index.d.ts 实为版本 2 和 SourceView/相关类型；DESIGN 拟议树为 HierarchyTree。
首轮 PK01/02 原先被这个 B 错误挡住，不能当候选语义已测。仅删除该无依据对照，SourceView/版本仍受测，新候选/类型/CSS/peer 预期不变。
首冻和第一轮完整失败及原公开声明原样留存，不抹除 B 错误。
最终两处设施加固则收紧来源和语法警告，不据产品实现调整语义；静态 B 辅助核对未再发现确定设施阻断，不代 C。

## 来源与保护

原样 B44→A 导入（只比较 B 自有测试的原始 blob delta，不读 A 实现作 oracle）：

- 52ae45cfe5a4c8fa7cf6e6ea5f515cf5004237a1 → d34b3850044a993a9a33d5e5f737b9404e7029e9。
- 7cc75a63c5321ff5189f6c4d061e9a2ee6000d0e → 11777a2d52e96d432dafe3a79e46a9810dfb26ff。
- fa52c594bdca96233f3fe995b9e9ff78eeee1520 → 710ba49b7ceeb2a617213da86235dc319eb1f55e。
- 7a0f805dc6908a3ecde2d8ed07554e4c520e0888 → c01276d4d722fcfec892b3059fa9eacf7b304b76。

12 最终来源路径相等；本轮只新增专项，原 M/B/P 普通1374/960/1356路径 bytes/mtime 保持，M49声明/3Core保持，P干净。
98 JS/d.ts 与原 B44 pins、主树字节相同。§6.18.1 到 §7 前规范15412字节，SHA256 baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db，原样。
REVIEW_LOG 原前2877862字节，SHA256 02004270c6abc5f79d5aa6df43f1b8feed6c438aced87b88aa3ec135666d08dd 保持；只追加、不 stage/commit。
B44 历史证据 API 回读通过不等于重跑其12/5/30。C45 已正式限定接受 B44 U01–03，C-98/C44关闭事实保持；C45不包含本 B45。

## 限制与交接

正式候选 UI、hooks、真实 SourceView→确认→Selection/Core/Electron、IPC、CSS视觉/焦点/AX均未执行。
CSS只承诺固定解析器无指定语法警告，不是通用有效性证明；peer单例只覆盖本次18.3.1消费，不证明所有合法版本。
没有重跑无变化 Core三配置/CTest/ASan、完整 check.sh、属性1096或旧74/4/5全集、原 DOM/30类型全集、真实大设计/跨平台/Node20/22/远端CI/压力。
既有104计划DOM/30历史隔离类型继续部分冻结；本包六类型另列，不增加已执行语义负例数。
Q1、原行新代次 stale_action/旧闭包、完整生命周期退订、空态强关联/AX及纵向差额仍开放；不宣布 M5 完成。
本轮无产品/API/ABI/TS/IPC/Schema/protocol2/schema7/配置/锁/工程格式变化；首版排除持久化，本增量无保存/迁移验收。
D无新输入、D-03仍限M6；不接管A/C/D，不重新开已闭问题。

交 A：可原样吸收冻结和证据；先交付公开新根出口/声明/CSS，才有条件跑六语义负例和正式UI，不放宽测试以适配缺失功能。
交 C：定向审四包能力probe、公开旧入口校正、真实来源及严格安装/警告门控；本轮未提前获 C 接受。
交协调器：本轮取证与固定交接后结束，无新会话/定时器/排队或轮询。

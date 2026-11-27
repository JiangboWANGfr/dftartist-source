# B39：C-97 格式回执排版整理

## 范围与固定版本

A 固定 `e21e89ac2dea2a5ea9977061a1c877e60d81fbc7`；B 初始 `5ceb3a59c95c05cf5e10bab3c63d5aa247afccd6`。
格式修订独立提交 `181bf676425323b1d2a39e88bbbc5e3fe4a9d87a`，只改 `docs/m5_b_c97_native_print_format_receipts.json` 两处 command 数组排版。
本轮依据原 B 固定 JSON 值、B38 冻结计划和 VALIDATION 的证据要求，不从 A 实现、自测或聊天生成预期。简单单文件 metadata 修复依 EXECPLANS 在 REVIEW_LOG 记录，不新设契约或批准门槛。

## 可验证验收与本 B 实际结果

E=`/private/tmp/hier-b-orch39-format.SZeNMI`；B 为当前 test/m5-tree 工作树；N 为本机 Node24.21.0，Darwin arm64。
F=`/private/tmp/hier-b-orch38-c97.yLofVz/fixed product 中文/web/node_modules/prettier/bin/prettier.cjs`。
只读复用已安装的锁定 Prettier3.9.10，固定工具目录与 A 当前 package/lock 相同，二者均未修改；没有安装或升级依赖。

| 输入 / 判断依据                                                | 本 B 实际命令                                                            | exit / 结果                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 原5ceb文件须复现排版问题                                       | N F --check docs/m5_b_c97_native_print_format_receipts.json              | **1**，唯一该文件 warn，0.061秒                                       |
| 仅允许 formatter 排版，不改变值                                | N F --write 同文件；N F --check 同文件                                   | 0 / 0，0.056 / 0.055秒                                                |
| 与原固定版本 JSON 对象完全相同；8条原回执/16流有效，原非零仍在 | N E/verify-metadata.mjs                                                  | 0，0.113秒；旧命令重跑0，旧后封格式失败仍为exit1                      |
| 旧主档/pins不变，显式纯API核自己的B及A固定导入输入             | 同上，verifyEvidence(a,{root:B/M})及checkEvidenceControls(a)             | 51捕获/132材料/8输入/4引用，1正7负metadata，当前产品执行0；非51条重跑 |
| 相关格式                                                       | N F --check 明确列新格式文件/旧controls/旧报告/B38计划/新测试/API/三入口 | 0，0.181秒；不是整个仓库格式门禁                                      |
| 非目标原文件/声明/Core/日志前缀不变                            | N E/protect.mjs                                                          | 0，2191普通旧路径严格保持，1目标仅格式；49声明/3普通Core保持          |
| diff空白及独立提交                                             | git diff --check；git diff --cached --check；git commit                  | 均0，仅目标JSON 2行插入/11行删除                                      |

目标原文件 **14224 bytes / bf491b7eaab55d2f61812f731d29b02991ce4d1d7cb0d2fb8fa9af70382bd6a9**，新文件 **14152 bytes / ffe5188a6a53fb7ec6a23ebb87ed9a61f10dba94574a33f04658bbd500f3e534**。
原固定提交、旧失败与旧SHA均保留；新SHA只对应相同JSON对象的新排版。A固定中的原文件仍等于5ceb原字节，等待原样吸收新修订。
八条历史命令的argv、时间、cwd、状态、双流gzipBase64/长度/SHA全部相同；不是删失败、修改期望或重新执行旧回执。

## 自有设施失败和来源证据

本B首个formatter前提脚本错误要求测试分支B较旧的web/package与A工具树相同，exit1；初稿和完整失败流保留。
仅纠正该临时脚本的前提：校验A当前与固定工具目录的package/lock一致、实际Prettier版本匹配其lock并记录工具SHA，随后exit0。没有改B依赖/产品/测试oracle；格式修订仅两处换行。
该初稿还导入会执行保护检查的本轮临时protect脚本，产生一条保护JSON输出；完整保留，不把混合输出误当单一格式工具回执。

既有B辅助器只读审计五组B38→A原样导入：各提交raw delta/mode/type/blob一致、初始10路径一致，35条命令/70完整分离双流；无首失败，不比patch正文，不审A新自测报告，不执行产品。
它核的是B固定5ceb→A固定e21导入；本轮新B格式文件不是已在A中的新字节。主B封档再次独立解压70流并核原流与压缩块bytes/SHA。
来源审计JSON SHA为3c8b43082578466d06b1d37f6668792054fdcc1a981fcd59932249dfdf6c0be8，原脚本/全部原流嵌入新证据，不仅给临时路径。

可携交付 `docs/m5_b39_format_receipts_verification.json` 含16捕获（2非零：B临时前提误断、B复现格式失败）、原/新目标、保护/核档/封档脚本、报告及来源原流；长度/SHA在最终REVIEW_LOG交接。
封后校验/保护回执留E，不递归改变主档。旧B38三个证据文件及报告保持：

- 主档1314460/SHA7b112985339a7301bcadbc5be0083855162c27e8434fa88c662ac9eea20dbf04。
- controls40296/SHA585793855786c5a1106944a16566c6dbd6557bbfcf446caa7e8ba7b990281fd0。
- 原报告10894/SHA523aec72b990418461fb29bb5f8727e80011cf3e6eec5af7c9cb4f4b51d974e6。

## 限制与交接

本轮纯metadata格式/核档，产品执行0，新DOM执行0。没有重新执行76/32/16/历史8原生矩阵、完整web/check.sh、Core三配置构建/CTest/ASan、属性/旧DOM/类型/包外全集、真实Core-UI/Electron/IPC、Linux/Windows/远端CI或压力测试；均不能借本轮元数据绿宣称通过。
未改任何生产行为、TS/JSON Schema/C++结构、公共API/ABI/IPC/protocol2/schema7、配置/依赖/工程格式；首版无持久化，旧工程加载/保存/迁移不适用。
原84计划DOM/30历史类型、Q1及完整组件差额保持，C-97仍由C复核关闭，不以本次排版替代运行时审查或放行UI/Electron/L06/L09–11。

- 交A：先原样吸收181bf67格式修订，再吸收本报告/证据；同步新格式文件SHA，不改原历史pins/原报告。无需重跑无变化产品矩阵。
- 交C：格式文件仅对象语义不变整理；C-97仍按固定原生红绿/真实CLI证据独立决定关闭。本B不代关。
- 交协调器/D：本B39单元结束，D无新输入，D-03仍M6；不接管ACD、不新会话/定时器。

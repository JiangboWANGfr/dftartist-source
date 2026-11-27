# B R3 固定061公开修复复验

**公开source子集及C58独立三配置通过，原oracle未改。C59段内取消尚待C认可新观察点及B独立冻结/执行，source和完整M3仍不放行。**

## 对象与独立性

产品 `061d1d17e147d3c468ef94a8c5ee2e7ae6563317`，B自有detached树；测试树test/m3，计划先冻 `3116a755f4d5f0aaf29156425dfc36386a726fc5`；DESIGN SHA256 `487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0`。不读A实现/diff/新增测试源/独立报告或C探针，不从A自测定答案；共享日志已见概要，不称严格盲测。无产品overlay/mock、skip/xfail、测试预期降级。

输入/预期/依据见[冻结计划](M3_R3_FIX_REVERIFY_PLAN.md)、[原source计划](M3_R3_SOURCE_REVERIFY_PLAN.md)。原source五项首冻624c09d、必要头适配14c869f，C58两项独立冻ecc606b；新产品原生登记源码hash与B冻结完全相同。原15混合API、九专项、原88CLI、原fixture/公开头与契约保持。

## 实际执行

三配置均OBSERVER OFF、M3 ON、EXPERIMENTS OFF；普通RelWithDebInfo及Debug sanitizer OFF，第三RelWithDebInfo ASan+UBSan ON。Frontend/DB/Core重编，选定产品/归档/静态消费者/十二API及probe重编或重链接退出0；未变对象与经hash校验只读依赖复用，不称从零或全目标构建。

| 每配置实际集合 | 普通 | Debug | ASan+UBSan |
|---|---:|---:|---:|
| 原CLI全方法 | 88/88，退出0 | 88/88，退出0 | 88/88，退出0 |
| 十二原生API XML | 57/139229，退出0 | 同左 | 同左 |
| 十二外部API XML | 57/139229，退出0 | 同左 | 同左 |
| 其中C58原样两项 | 2/93，退出0 | 2/93，退出0 | 2/93，退出0 |
| 原生十二API＋source/errors CTest | 14/14，4.67s | 14/14，7.88s | 14/14，28.74s |
| 前序Core/M1/M2/资源/共享/分层CTest | 27/27，20.27s | 27/27，34.82s | 27/27，165.95s |

均0skip；原十API50/136911，新source5/2225，物理2/93，总57/139229。原生/外部及CTest重复执行同oracle，不算不同覆盖。-N与逐条结果核对真实14项，不能用空匹配退出0充通过。新增source/physical这次确已原生整合并实际运行，不沿用旧3c2外部结果冒充。

C58同物理hard/soft include只产生一个改变身份，恢复后changed为空；同字节不同物理copy仍保留两个身份的控制通过。两项CPP SHA分别 `944d55c2ca35baf6de1bd858822340eea7ce27874aea5a18508b73a80c04461a`（source五项）、`c8b54b35c93d424e1d05bb7b50b606a6647e8af099073b9e6e12ed4df5556d3b`（物理两项），与旧红基线一致，不猜FileRef编号或硬链接代表路径。

## 资源、web与证据

原生RSS四方法/36样本退出0，fan10/depth3/4/5、原相邻3倍/整体5倍门禁不改，最大中位数8830976 bytes；none/empty/miss中位数8585216/8585216/8798208，sparse末级8830976。仅open/snapshot/diagnostics；本机其他任务及自身ASan还在运行，不将耗时/峰值扩展为source/trace/M7绝对资源验收。

Node24.21.0/npm10.9.2：web类型/分层及五反向探针退出0；独立11方法1绿10红、0skip、退出1，八项M4 HierClient/两项M5 SelectionModel未实现，protocol一致性控制通过。本阶段不再npm ci、不改锁/engines；部分堆栈被工具截断，实际汇总/全部方法状态保留，不称完整raw归档。

[逐命令/退出码/实际XML摘要/全部CLI方法/CTest输出/配置/输入及依赖hash](m3_r3_fix_reverify.json)。ASan CLI约四分钟诊断时仍在执行末尾trace_boundaries，wrapper完成才输出；实际等到退出0/88通过，不提前推定、不杀进程/跳过/加长测试超时。辅助版本采集最初误用version，产品正确bad_request/退出2；公开--version修正退出0（protocol2/schema6），不是功能失败。

OFF三CLI SHA256：普通 `e09215511c0363a2597ca8224b5c455cbd8ac42fc51c61d42009901e14a74b8d`，Debug `c0123fca5bbe72939d2a22971e7e2b048d4f452277207aa4fd70fff031096a37`，ASan `0a0de67cf0bc2e96d3b4772b21c2e00367ebe1e0dcca4fe8183ba910560caf35`。DESIGN/公开头/复用Slang两文件及锁hash不变，固定产品树干净。新静态消费者重编不承诺旧ABI或M4完整机器Schema/TS验收。

## 历史、未执行与交接

旧3c2的C58 OFF/ON三配置各1绿1红、92成功1失败断言、runner42/wrapper1仍见[source旧报告](M3_R3_SOURCE_REVERIFY.md)ec2ecf1及[observer旧报告](M3_R3_OBSERVER_VERIFICATION.md)1a7933d。原source缺入口/API旧头编译失败、observer首冻刺激不足红也保留，不用本绿覆盖。

C59新事件尚待C认可，B没有读其实现/调用点或A测试、没有冻结新oracle、没有061 ON执行；旧3c2原八observer三配置8/285绿不能代替新版本。A已报告1410407原生测试整合及其执行，但B本轮只固定061，未独立核对/执行141原生observer，不把A报告算B结果。

未执行whole check.sh/全目标/fullCTest/A自测、真实NX9000/OpenC910独立verify、Linux/Windows/远端CI/TSan/fuzz/mutation/覆盖率/分配或stat失败注入。I/O64KiB、全体≤256候选检查、continuation/trace全分配、强制building代次及M7绝对RAM/SLA未因此证明。当前CLI→Core不等于Electron/React/NDJSON IPC；首版持久化/恢复/迁移/撤销重做不适用。

交C：C58冻结反例在新固定产品原样全绿，可正式复核关闭；C59及新机制仍待你审。交A/协调者：公开修复子集完成，保留C59前置与M3总体未放行；获C认可后B另领取、独立补冻新段中途取消/粒度/无半成品发布及全量重试，沿用原八项回归。主树只追加本人交接，不改调度表或夹带他人修改。

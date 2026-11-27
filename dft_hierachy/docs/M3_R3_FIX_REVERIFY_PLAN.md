# B R3 C58/C59 固定修复公开复验

固定产品061d1d17e147d3c468ef94a8c5ee2e7ae6563317；DESIGN SHA487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。Agent B继续独立测试，不读A实现/diff/新增自测/验证报告。新公开API/Schema与冻结头hash不变，B新增七API被原样登记且hash相同；实际新产品结果须自有固定树执行。

## 输入、预期与覆盖

沿用[公开source计划](M3_R3_SOURCE_REVERIFY_PLAN.md)、[source OFF旧报告](M3_R3_SOURCE_REVERIFY.md)和[原observer计划](M3_R3_OBSERVER_FREEZE_PLAN.md)全部oracle。C58手写hard/soft include别名、相同字节不同物理copy、修改/恢复输入预期不变；两项在旧3c2 OFF/ON三配置各1绿1红，历史不覆盖。原source宏/include/-D/UTF8/CRLF/hash/半开/分页/冷热/cache0/共享/取消重试、step/trace及前序M1/M2回归不降低期望。

三配置自有build显式先OFF：真实产品/十二API/静态消费者构建；固定仓库原十API＋source新增两套共十二API，以及source/errors实际CTest应14项。真实执行再以-N/结果核对，不以预期登记数充结果。外部同原七新增及十旧API，共57用例；C58应2/93（旧红不算新过）。原88CLI实际wrapper全方法，前序27CTest，原生RSS与web既有门禁单列，web未来十红不转绿。除受审PRIVATE测试适配外不改产品/Schema/IPC/工程格式。

C59新排序/去重通知**尚待C审**，不先读其实现/调用点，不以A1024输入/次数生成oracle，也不以原SourceRange外层取消代测。若C认可到达，B仅读获准接口/语义，再独立手写范围组、执行中指定通知request_stop、取消后无半索引/重试冷/热/游标不变，另先冻结再ON三配置执行；无sleep/墙钟替代。原八observer预期保留，不改答案配产品。

## 步骤与交付

- [x] 最新协调/日志领取；旧报告1a7933d独立交付；自有干净固定树切到061。
- [x] 本计划3116a75独立提交；原oracle/fixture/公开头hash核对不变，三配置OFF重编均0。
- [x] OFF三配置实际重编、原88CLI88/88、十二API57/139229、真实14/14CTest及27/27前序；RSS4/36样本通过，web独立1绿10未来红，保存命令/退出码/计数/hash。
- [ ] 仅在C认可新observer后独立补冻；报告实际ON集合与仍未测边界，不将C/A结果算B执行。
- [x] [公开复验报告](M3_R3_FIX_REVERIFY.md)/[实际JSON](m3_r3_fix_reverify.json)独立提交并交A/C/协调者；主树只追加本人交接。C58新固定反例全绿但关闭归C；C59新适配前置未满足，本未选项保持待续，完整M3不放行。

当前只CLI→Core；Electron/NDJSON/TS/UI是M4–M6未来，首版持久化/恢复/迁移/撤销重做不适用。M7绝对RAM/SLA、Linux/远端CI/TSan/fuzz/覆盖率/分配失败不因既有相对门禁通过。不跑A自测或全目标/full check.sh冒充独立集合。

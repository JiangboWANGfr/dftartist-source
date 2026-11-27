# C-55：限定适配的仓库目标依赖修正

C在R2-C指出B测试登记缺陷。B已在固定产品1f42fb2711764cfba863acc12a06b46b33f28c44、自有build-b/build-b-debug/build-b-asan独立运行：

`cmake --build core/<build> --target b_m3_step_adapter -j2`

三配置均退出2、运行0，M3StepAdapterTest.cpp:3找不到hier/db/DesignDb.h。产品及其他消费者已重编，不能归因于尚未交付source，也不能用外部runner的db/include设置取代仓库入口证明。

唯一代码改动：该测试目标PRIVATE链接hier_db，取得其已有包含路径/静态依赖。保留hier_protocol/hier_frontend、受审内部query/src和警告配置；不修改生产目标、PUBLIC包含面、Frontend适配机制、测试源/fixture/任何预期。先独立提交冻结此必要构建适配，再执行测试。

验证：B固定验证树仅叠加此一行测试登记，产品代码仍1f42fb2；重编并实际执行三配置仓库目标（原3用例/144断言应通过），另核对其余已交付八套仓库API、外部runner及产品二进制SHA。保存原失败和overlay差异；验证后用明确补丁撤销本人overlay、恢复固定产品树干净，不触及A/C工作树。

实际后续结果记录在M3_R2_REVERIFY.md / m3_r2_reverify.json；交A原样吸收此独立提交，C-55正式关闭归C。本适配修正不使未交付source或observer变成通过，不宣称整个M3构建完成。

# B R3 source 独立复验计划

## 固定对象与验收

产品3c2bdd210324737f82ea29c1afeed4c04727c495；B旧测试/报告03729db667ff6b262ab824c862017fb59859d101；DESIGN SHA256 487211cec837aed48879f9915372780f1c03b7b0adf61cccbcbc4bb36a6e89e0。依据§5.5.1/5.5.6/5.5.7；上一固定333c484的source8缺入口及15API未运行保留为历史，不能改写为本轮执行。

| 验收 | 输入与判断依据 | 现有覆盖/补充 |
|---|---|---|
| 快照源码范围 | 原source.sv/include的宏、UTF8/tab、赋值及两个例化；手算原字节offset/line/column/hash | 原7CLI及错误控制保留；新嵌套宏/显式-D控制单列 |
| 所有occurrence/分页 | 原10万leaf至少100001定义/实例；完整页并集、next前进、改页和错查询/跨快照游标 | 原15混合API完整执行，不仅挑绿的source部分；内部物化成本待受审observer |
| 不可变与I/O | 临时输入追加/损坏UTF8/删除、CRLF、表外路径、多个物理文件变化 | 原API保留；补文件顺序/恢复/清理与空白坐标边界 |
| 稳定性/取消 | shared/per、冷热/cache0、查询乱序；合法成功控制后验证错误与预取消重试 | 不把预取消当执行中取消；新observer未获C认可前OFF |
| 前序回归 | 九API、原88CLI、M1/M2、资源/共享/分层 | 三配置实际重编/执行，不使用A/C输出 |

## 范围与兼容

最新C新增C58 Medium（同物理硬链接重复FileRef）/C59 Medium（同范围大组排序去重缺256粒度取消）。B原集合全绿不关闭这两项，新增M3SourcePhysicalTest.cpp两API先独立冻结：同一guarded include经软/硬链接读入，修改物理文件后changed恰一FileRef；相同原/新字节的独立copy include必须保留两个FileRef，不按hash合并，changed按规范路径顺序。链接/复制仅临时目录，使用filesystem::equivalent验证物理同/不同，显式-D合法控制；不读C探针源码、不猜f:N或硬链接显示路径选择。两个新增目标仅B树/外部登记，原五API/旧oracle不变。C59现有事件不在整理段内，不宣称同步取消已覆盖；等待新适配固定交C审后再冻结准确段内测试。

B只改独立测试、必要测试登记和证据文档，不修改生产实现/公开契约。source公开类型/布局已改变，所有实际静态消费者重新编译/链接；核对schema/protocol但不由版本值推导ABI或权威机器Schema/TS一致性。CLI→JSON→Design→DB/Frontend，不当Electron IPC。M4/M5红项按阶段列出，首版持久化/恢复/迁移/撤销不适用。

不读A实现/diff/自测报告及新增自测源；必读日志已见概要，不称严格盲测。A阈值不是B oracle。若某种声明项精确端点契约不明确，列歧义，不根据实现选答案。observer适配等待C独立认可，本轮不能声称内部成本、索引/产出中途取消或确定性时钟通过。

## 执行

新增冻结为M3SourceIncrementTest.cpp五公开API用例，输入source_increment.sv/svh；独立手写两层宏展开、重复同一include（guard）及12个数组实例，显式B_R3_CMD=1，并在自建临时目录建立输入symlink。主文件SHA1120a4db735a84f98f43d57472d5e80e66836710ac56b9558121b89f5f2f7248，include SHA25906914ac58feace91dac4bdba2ab91b9c0617c874326ad062397b35a8a96c4；预期hash为固定原字节，不取产品返回。

1. nested outer macro：声明definition及assign statement都指最外调用完整半开范围。该位置恰37命中（1 DefRef+12 instance definition+12 signal definition+12 process statement）；按范围/kind/数值引用顺序独立手排，不用全量产品页当oracle。页1→2及1→7、冷热、shared/per、cache0/64MiB。
2. physical table：两个物理文件的规范路径及固定SHA；-D和宏虚拟buffer不应成为changed，重复include只一次。删除两物理文件后恰两FileRef按路径表顺序changed/complete=false；旧span仍可查。
3. half-open/EOF：表内模块结束位置、include最后原字节后的EOF插入位置和模块外include行位置均complete空无next；超EOF行/列、0行/列BadRequest。EOF是原字节长度对应的1基位置，不是假造额外内容；若评审对末尾换行后的插入位置有歧义，应单独提出而不拟合实现。
4. edits/restores：同快照改两个文件、原continuation与snapshot hash不变；read原字节追加结果matches=false、恢复原字节matches=true/checkInputs清空；Design/文件对象析构后owned临时目录不存在。
5. errors/pre-cancel：非法SourceKind BadRequest、definition不适用statement NotFound、表外路径NotFound；无效limit优先于预取消，合法source/read/checkInputs预取消Cancelled，原页原游标重试相同，source游标不能用于search/instancesOf。只标预取消，不当执行中证据。

只追加新目标PRIVATE普通公开依赖；外部runner另增加原混合API及新source目标，链接B自建库，不改生产目标。复验树无新source源码/登记overlay，因此新增五API只在B外部runner执行，原15/九套仍核对真实仓库入口。不把外部通过冒充新目标已在A产品登记。未冻结声明项所有语法变体的精确首token端点，列覆盖缺口，不据实现采用某个范围。

首冻624c09d后新增runner三配置编译退出2、五新增用例运行0：B的mkdtemp漏引入当前macOS实际声明头unistd.h。已按编译器/SDK直接证据仅添加此头，预期/fixture不变；原15及九API三配置已实际通过。首轮旧公开头语法编译退出1同时含这个测试错误和SourcePos/Kind缺失，保留但不全称功能未实现；适配后再记录纯缺source的旧头编译基线。此为测试运行必要适配，不是A产品缺陷；当前只支持macOS/Linux测试辅助，不宣称Windows运行过。

- [x] 核对旧fixture/API/hash；独立冻结公开source增量并提交，原预期不改。
- [x] 固定产品自有detached目录，普通/Debug/ASan+UBSan observerOFF三配置重编，记录所有实际消费者/登记。
- [x] 原88CLI、原15API及九API三配置；增量单列；M1/M2回归和原生RSS。
- [x] 记录基线/本轮实际计数、失败类别、源码/产品hash、未执行与歧义；独立提交报告/JSON并追加交接。

实际：三配置88/88，原15/102083、九35/34828、新五/2225、十仓库50/136911、十一外部55/139136均通过；真实仓库12CTest/前序27全通过，原生RSS4/4。新增C58两API三配置各1绿1红/92成功1失败断言/runner42。web1绿10未来红。详见M3_R3_SOURCE_REVERIFY.md/json；C58/C59不放行，后续受审observer单独冻结与ON验证，OFF结果不改记内部成本。

原生RSS保持原相对阈值，不作M7绝对容量/SLA；执行并发的墙钟只记录。文件写入/损坏/删除只发生在测试自建临时目录，冻结fixture和真实设计只读；临时对象RAII清理。构建沿用已校验只读第三方源码、只用B自建归档。

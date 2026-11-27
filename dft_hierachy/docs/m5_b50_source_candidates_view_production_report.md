# B50：SourceCandidatesView 首版生产独立验证

固定产品0cdee6ef053335d31bf6af60b1e8e791668541bf；B初始f1a4a2dae5be29733bded881230c4f1b614102a4。
**既有106/30/4/6及完整check.sh通过；真实生产C-100另有两条独立失败，交A修复，不能据旧门禁绿放行该缺陷。**
遵守REVIEW_LOG最新用户决定：原106 DOM/30类型是充分实施前置，不新增前置类别、观察机制、证据API或测试设施。不以Q1/堆/trusted/读屏/更深并发重新阻塞实施。只有C50已实证、原冻结未覆盖的C-100在原手势类别内补了最小两例，依据仍是既有§6.18.3，无新契约。

## 规范、输入与隔离

以DESIGN§6.18和原B fixture/oracle判定；读取公开标准入口及验证说明，不读A实现/diff/自测生成期望。日志含A摘要，但A执行不作为本B通过依据，不宣称全程盲审。
执行原集合的P候选137文件与B固定f1a4a2d逐字节相等，完整脚本结束后再次核相等且P Git干净；原失败/预期/历史证据不改。后续C-100最小增量只维护B的两个fixture/runner并新增两例数据文件，另有独立冻结SHA；没有按实现放宽oracle、skip或xfail。

M=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy；
B=/Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_hierachy-test-m5-tree；
E=/private/tmp/hier-b-orch50-production.39GeEw；P=E/fixed-product独立detached。
仅复用既有B运行捕获/保护脚本并维护明示例外；没有新增证据设施。实际原始命令与分离双流保留E/*.capture.json，不以新证据API或大归档代替生产验收。
自有P离线原锁安装、独立构建。Core仅从既有缓存复制Slang/Catch2/fmt/boost_regex/mimalloc/tomlplusplus源码到E/dependency-sources，并逐文件核相等及Git tag/HEAD/干净状态；不共享主树或他人的产品二进制/构建输出。
三个独立CMake缓存指定这些源码、FETCHCONTENT_FULLY_DISCONNECTED/UPDATES_DISCONNECTED=ON和自有旧B schema-venv；随后执行未改的完整check.sh，JOBS=8。正常observer OFF、Debug/ASan ON；Debug/ASan禁用mimalloc沿原构建规则。

## 既有冻结的实际产品结果

| 原DOM组                                                            | 本轮实际执行/通过                      |
| ------------------------------------------------------------------ | -------------------------------------- |
| 根56（props/五态/partial/事件/生命周期/SourceView→候选→Selection） | 56/56                                  |
| pagination                                                         | 8/8                                    |
| actions                                                            | 8/8                                    |
| multipage                                                          | 6/6                                    |
| pointer-rebind                                                     | 6/6                                    |
| deferred-bindings                                                  | 6/6                                    |
| focus-scroll                                                       | 6/6                                    |
| sync-feedback                                                      | 2/2                                    |
| feedback-lifecycle                                                 | 3/3                                    |
| uncommitted-render                                                 | 3/3                                    |
| pointer-session                                                    | 2/2                                    |
| **合计**                                                           | **106/106；failed/blocked/skipped均0** |

原30类型在production模式正向guard成功后30/30语义负例通过，未用proposal声明代替真实公开出口。
包外PK01–04四项均实际通过：运行时根出口、严格类型、公开CSS、peer/React单例；PK02正向guard之后六额外类型负例6/6。四包探针不是额外DOM覆盖，六类型不并入原30。
包父入口正常exit0、setupError=null、cleanupErrors空、backgroundTasks=0；本轮未复现已交接的包进程结算异常，不据此否定其历史发生。
controls为209当前Node设施、8历史CLI、76模型/浏览器前提，入口exit0；不是217或76个额外候选产品语义。历史CLI按既有标准入口恢复旧档原输入的隔离维护方式运行，不把旧pins当当前根匹配，不改写历史档。
原B43/B42故意错误通道依旧按原控制判断，不统称所有pageErrors为空；目标106组gatePageErrors/releaseErrors等实际记录保留原输出。
历史缺组件/类型能力红保留在原报告，不是本B50重跑；本轮已是真实生产执行，不能继续写成blocked，也不把旧红重写成通过。

## C-100：仅真实缺陷触发的最小回归

C50正式报告后，独立核原DESIGN§6.18.3与B47：原G01/G02在独立激活前都先送达旧配套click，不能覆盖旧指针在列表外松开、没有配套click送达当前行的路径。不读取C探针源码或A生产实现推导预期。
独立先冻8d8ecaba42f39148b76bf8cb62f213c24fb31cc6，只有三个测试路径：原pointer-session新增c100-cases.mjs，原fixture.jsx/runner增加必要case选择。复用原group、公开调用记录器、bindings/currentConfirm、DOM等待和清理；原cases.mjs G01/G02、原断言及其它冻结不改。默认runner仍仅原两例，新增用同一runner --c100单列，原106/30不被替换。

| 最小输入                                                                              | 规范预期                                                | 固定0cdee6e实际                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| B50-C100-01：旧行down→同位置切模型对→body外部up、不送旧配套click→新当前行无down click | 首次独立激活以当前已提交原action向当前Selection确认一次 | **失败：confirmations=0、enabled=true、feedback=0、selectionUnchanged=true** |
| B50-C100-02：相同路径但只换同快照Selection                                            | 同上，不能靠L6拒绝掩盖丢激活                            | **相同失败**                                                                 |

实际两例executed2/passed0/failed2/blocked0/skipped0，均在原确认断言失败，非缺组件/未准备好。每例cleanup.errors/globalErrors/unhandled/pageErrors为空，gate/releaseErrors为空。
同一维护后的runner默认原G01/G02仍2/2；原14 Node设施/selection清理控制也全过，保留“旧配套click零确认后独立激活一次”的反向约束，不能为修C-100一律遗忘旧手势而误确认新行。
使用原B47 synthetic pointer37及无down/detail0 click，不声称trusted鼠标、读屏或设备E2E；不增加观察点。期望来自既有规范/旧B断言，而非要求匹配C某个内部实现。此为两个具体修复回归，不是重新扩张106前置或追加通用手势体系。
B只冻结并复现，不修改产品；C-100保持开放、生产修复交A。C-99由C50正式关闭，不由B代签。

## 实际命令

PATH=/Users/jiangbowang/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin；cwd=P（安装在P/web）。
N=/Users/jiangbowang/.npm-global/bin/node；Python=/private/tmp/hier-b-orch3-renderer.iRHIDr/schema-venv/bin/python。

| 命令                                                                                       | exit / 秒 / 结果                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| git worktree add --detach P 0cdee6e；N E/protect.mjs --snapshot                            | 0/0.850；0/1.193                                                         |
| npm ci --offline --ignore-scripts，P/web                                                   | 0/0.661                                                                  |
| npm --prefix web run check                                                                 | 0/9.647；196定义/27方法、tsc-b、57模块192依赖、7分层负例                 |
| npm --prefix web run test:independent:m5:source-candidates-view                            | 0/45.180；106 DOM、30 production类型                                     |
| npm --prefix web run test:independent:m5:source-candidates-view:package                    | 0/11.670；4包/6额外类型及guard                                           |
| npm --prefix web run test:independent:m5:source-candidates-view:controls                   | 0/10.448；209+8 Node、76前提                                             |
| HIER_SCHEMA_PYTHON=上述Python JOBS=8 ./check.sh                                            | **0/906.775；从头到尾正常退出，all checks passed，captureComplete=true** |
| 原pointer-session/run.mjs（维护后，从B运行，显式产品P/工具P/web）                          | 0/1.322；原G01/G02 2/2                                                   |
| 同一命令加 --c100                                                                          | **1/0.873；新增两例0过2失败**                                            |
| N --test --test-reporter=tap 原pointer-session/facility.test.mjs和cleanup-control.test.mjs | 0/0.190；14/14                                                           |
| N Prettier --check 七个本轮产品TS/CSS/包/接线文件                                          | 0/0.460；只读未改产品                                                    |

三个候选定向入口在web check完成后并行启动；重复tsc为增量构建，不重复累计覆盖。完整标准脚本随后独立执行，不把定向结果冒充整脚本成功。
Node24.21.0/Darwin arm64、React/DOM18.3.1、TS5.9.3、Playwright1.64.1/Chromium156.0.8078.4、esbuild0.25.11、Prettier3.9.10；CMake4.0.2、AppleClang17.0.0。原锁无新依赖。
Debug/ASan初配置各记录一条未使用FETCHCONTENT_SOURCE_DIR_MIMALLOC参数警告（这两配置本来禁用mimalloc），不称配置全无警告。三配置各有6条ld重复静态库链接警告（共18，libhier_frontend/libhier_db），其它warning:行0；不能称构建零警告。原Core树与此前固定版本相同，未将其无证归因新增候选组件，也未擅自修改Core。
准备读取曾猜测/opt/homebrew/bin/clang++及/usr/bin/ps不存在，后用/usr/bin/clang++确认；不混作产品测试失败。两次统计输出过大被外层显示截断，原.capture.json完整双流未截断，之后仅提取计数；不据显示尾声替代原始输出。

## 完整入口、保护与交接

完整脚本全程exit0、signal/error为空、stdout4006339字节/捕获完整，非局部输出或定向补跑拼成通过。三个Core配置实际CTest为83/83、86/86、88/88，耗时33.03/55.08/110.41秒；HIER_TEST_M3/FUTURE=ON、observer OFF/ON/ON。完整入口覆盖既有SDK/Node/Core、选择/树/属性/renderer、源码/候选/位置/导航/确认、旧SourceView及refKind/schema7、最终候选三入口。重复入口不叠加唯一覆盖数。
本B正常退出不否定A历史父进程超时；没有改变watchdog/超时/预期。完整入口与C-100两例分开：前者运行P的原137输入，后者从B对同一P执行，不相互污染或用前者绿吞后者红。

M/B/P旧ordinary1436/1009/1418、M52声明/三Core、原日志前3063296字节/SHAe7e443bedd0e2af3f78b6e3d7c3dc27f25064b3e036eaf0b1e546f3eb7b8c2d0已保护。明示两个B fixture/runner维护按8d8ecab后pin核，其余旧B/M bytes/mtime保持；P仅web/package-lock.json被标准npm install触碰mtime，49797字节/SHA d9b7913a9712be0bcae2893708dde8bad3d113be297e2df7645c3f834c7e50ef未变，Git干净。
第一次严格保护命令因此exit1/0.913，原失败留档；全路径诊断仅此P锁mtime不同（原1792334159786551044→1792334901373002093）。只维护该自有P路径mtime例外，仍严格比较原bytes/SHA；随后保护exit0，不声称全部mtime未变，不回写初始快照或恢复时间戳掩盖发生。
六依赖源码复制件和共享原缓存前后tag/HEAD/逐文件字节相同，均Git干净。主树只追加REVIEW_LOG、不提交，原协调/research不改。B只提交最小C-100测试维护及独立报告，不改产品/其它冻结oracle/旧helper/历史档/标准入口；旧B49/B48档依各自固定版本核旧pins，不用当前已维护fixture冒称历史pins仍匹配。

原始证据在E，采用既有capture格式（精确命令、cwd、时刻、退出/signal/error、长度/SHA及压缩完整双流），不是只保留终端尾声：

| 文件（E下）                      | 字节    | SHA256                                                           |
| -------------------------------- | ------- | ---------------------------------------------------------------- |
| full-check.capture.json          | 2623892 | fafb5006e1bb4857c63cf4e901774dd57f4a4512d66d2e602f1dd78635285f18 |
| c100-production-red.capture.json | 5085    | 30e3c471cdab6a8771ddffdc029567b7e4b8fec6aac0bdf62a32815b03cfbb95 |
| c100-original-cases.capture.json | 5092    | 6f4e92b44edbd18b1e8c6bece303fc6bbfe72f0526790a594ae42ea73f406b1e |

P/core/build、build-debug、build-asan各保留原build.log/ctest.log，三配置构建和测试均独立产生。npm包外消费者、tarballs/cache及其它既有runner临时材料按原runner保留，没有删除证据目录或启动新常驻工作。

本轮验证新增L7公开类型/根出口/CSS及真实UI行为，不新增C++/IPC/Schema/配置/插件/工程格式变化；首版无持久化，保存/恢复/旧工程迁移不适用。
标准脚本的SDK/Node/Core回归与controlled Transport下的候选DOM分别报告，不拼成真实Core UI或Electron IPC；renderer单元也不等于main/preload链。
Q1强观察/堆、连续旧行更深动作路径、完整AX/读屏/trusted设备/跨平台、真实Electron/demo及processor_core整套UI E2E仍是后续范围，不新增为本轮前置。SSR/hydration无承诺，不宣称M5整体放行。
C50正式关闭C-99；本B独立确认C-100，仍交A修复、C定向关闭，不代C签字。未运行远端CI、Linux/跨平台或大设计附加回归，不称其通过。
本轮原标准集合通过，但有明确真实产品差异C-100，不能给固定0cdee6e无条件放行。交A原样吸收8d8ecab并运行同一runner --c100，同时保持原G01/G02及106/30/4/6；可按现有标准入口接此具体回归，不改变旧预期、不重开通用设施前置。交C按修复固定SHA复核，B随后按原两例复验。
最后固定报告SHA/完整命令/结果/限制追加REVIEW_LOG后结束，不新会话/定时器、不向A/C/D另发消息或排队。仅复用既有B辅助静态核原验收映射，未执行、不代C。

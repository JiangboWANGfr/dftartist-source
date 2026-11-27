# B M4 私有确定性门禁冻结执行计划

## 目标、固定对象与权威

2026-10-12；Agent B。用户要求保持独立测试职责，C已认可§5.6.9具体声明/控制，
DESIGN SHA e458f01177b20c0eb60693c90196b7374aa264be5aefe4e178fa94fc927550fd，
SessionContract.h SHA0295e91ce7b1aac4d8b2a7a9011686f431a787e27747a45309ae6cb636901af6。
声明目前无定义/CMake接入。按SHA捕获到B临时独立目录，只用于自己的编译/链接基线，
不把这个副本变成第二份生产接口，不提交或实现替代状态机/解析器。

输入及期望来自DESIGN5.2/5.6.2/5.6.4与B原31项验收设计；C认可的新768输出记录/预留、
取消动作返回拥有stop_source、decoder错误字节位置也明确冻结。
不读A运行时实现/diff/A新自测，公开交接摘要已暴露不称严格盲测。

## 基线与文件

test/m4起点781b3a1；自有旧Core模型/已校验Catch2源码和自建静态库来自5bd工作树。
SessionContract没有函数定义，故syntax-only可验证类型/调用，链接应因缺私有定义失败；
没有实际私有业务测试绿基线，不能把语法绿算线程/背压/取消通过。

只在core/tests/m4/private新增ReaderDecodeTest.cpp、SessionStateTest.cpp、
SessionWorkerTest.cpp、PrivateTestSupport.h；另更新B执行计划/报告/证据与本人日志。
既有Schema、客户端/Node测试、Core生产、公开头、第三方依赖和协调表不改。
不为测试发明私有API，不使用自己的decoder/scheduler；调用同一受审真实类。
CMake私有runtime目标尚未交付，先保留明确编译/链接命令；交付后必要登记适配不改oracle。

## 可验证验收

- reader：每短输入字节切分/逐字节；仅一帧/consumed及剩余后缀；空span/EOF/粘滞；
  字节1MiB及多1、跨CR/LF、待判CR转内容；finish后状态按新明确约定。
- decoder：同一decodeFrame，拥有树/词法数字、不经double舍入；UTF8优先、JSON错误、
  解码后重复键及第二引号位置、深度128/129根1/数组混合、字符串括号不计数。
- State：FIFO/独立拥有、256含运行的满与拒绝不移动；停止动作在锁外、intent而token未停止、
  终态先后的对照/一次发布/槽释放、progress、768输出与预留/backpressured重试不二次消费id。
- worker：真实打开/查询/关闭/join；四阶段probe只记录/闩锁/closing唤醒；
  before_take队首被取消后重取、before/after_core和after_terminal胜负、probe持有/失败RAII释放。
  这些不冒称Core长循环内部取消。OFF正常线程接线与ON门禁分报。
- 资源/隔离：声明ON/OFF调用可编译；未来真实产物symbols/安装隔离、Debug/ASan另实跑。

## 执行与交接

- [x] 领取C已审声明/字节捕获；计划先提交；保护已冻结文件与A工作树。
- [x] 独立CPP测试先提交，不根据实现调期望：eb17c21、d24c07d、3118b68。
- [x] 自有ON/OFF语法消费均0；预处理隔离声明；链接均1缺私有定义，0深层执行。
- [x] 验收ID映射、实际命令/计数/源文件SHA/未执行项与失败装配记录保存独立报告。
- [x] B确认B15原冻结输入缺口解决并关闭，测试代码冻结；实际运行时/线程/生成/E2E等门禁仍保留。
- [ ] 固定真实runtime/构建入口到达后，必要链接/fixture适配由B负责，再运行ON/OFF与sanitizer。

B15只由B确认关闭；C审真实接线/所有权/OFF产物；A在对应B冻结后实现这些私有类。
没有runtime或链接目标不循环猜库名、不用自己的实现让测试取绿。断言失败用RAII释放门闩，
等待只用有界harness deadline和状态通知，不用sleep竞速。项目持久化/M5-M7 UI本轮不适用。

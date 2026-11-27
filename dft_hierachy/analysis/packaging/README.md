# 原生 Analysis CLI 套件

本套件一起交付已有四个分析命令；不新增分析算法，不表示 Studio 页面或扫描/MBIST 插入已经完成。

在 Hierarchy 仓库根目录构建和安装：

```sh
cmake -S core -B core/build-analysis -DHIER_BUILD_ANALYSIS=ON -DHIER_BUILD_EXPERIMENTS=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build core/build-analysis --target dft-seqcheck dft-objects dft-memory dft-wrapper -j 4
cmake --install core/build-analysis --component AnalysisCLI --prefix /absolute/path/analysis-cli
```

整个安装目录可以搬移；原生程序不需要 Node、Python、源码或构建目录。仅面向构建平台/架构及系统运行库；自定义动态库由构建者负责，不提供通用跨平台包、签名或公证。
以下命令使用默认 GNUInstallDirs；自定义 bin/data 相对目录时按实际位置调整。
自定义目录中的 `./`、内部 `./`、重复或末尾 `/` 会统一规范化；空格和 Unicode 保留，`.` 可表示 prefix 根目录。
安装与清单使用同一规范值。绝对路径、`..`、驱动前缀或 CMake 控制字符在配置时拒绝；校验器仍拒绝手工注入的非规范清单。
目录及构建元数据须为合法 UTF-8，配置/清单生成拒绝 C0/C1 控制字符。正常 Unicode 保留原字节；元数据中的引号、反斜杠和类似 CMake 的文本按数据准确转义。

共享归档器规范 tar/gzip 元数据：同一清单和文件内容、同一 Python/zlib 工具链重复打包得到相同字节。
成员按路径排序，时间与用户/组字段清空，程序权限0755、数据0644；不记录临时文件名。不同压缩库版本不承诺相同压缩字节。

```sh
P=/absolute/path/analysis-cli
D="$P/share/dft-analysis"
python3 "$D/verify.py" --prefix "$P"
"$P/bin/dft-seqcheck" --top sequential_example --scope sequential_example --recursive "$D/examples/sequential.sv" --require-complete --fail-on-error
"$P/bin/dft-objects" --top sequential_example --scope sequential_example --recursive "$D/examples/sequential.sv" --kind port --text .q --require-complete
"$P/bin/dft-memory" --top memory_example --scope memory_example --recursive "$D/examples/memory.sv" --memory-library "$D/examples/memory-library.json" --plan-tests --schedule-tests --time-tests --test-config "$D/examples/memory-test.json" --require-complete
"$P/bin/dft-wrapper" --top wrapper_example "$D/examples/example.sv" --config "$D/examples/chains.json" --explain-chains --format text --require-complete
"$P/bin/dft-wrapper" --top wrapper_example "$D/examples/example.sv" --config "$D/examples/excluded.json" --explain-chains --format text --require-complete
```

时序示例调查两条真实时序写入事实；对象查询按路径中的 .q 过滤端口。内存例子的容量、测试操作数和功耗是调用者声明：示例 RTL 的透传模型不实现 RAM，不用于证明存储器功能或物理测试正确。
Wrapper 第一份配置有已知复位两极冲突，第二份显式排除 b 后复验；更改参与集合不是修复 RTL。
`--require-complete` 只检查证据完整性；完整的已知 Wrapper 冲突仍可退出0。各工具原错误/partial退出码及JSON格式保持，不把退出0当作整芯片认证。

`schemas` 含全部现有 sequential/objects/memory/wrapper 报告与输入 Schema，以及 protocol 引用依赖。离线 registry 应按文档原 `$id` 注册，不改写 URI、不联网回补。
独立安装清单为 `analysis-cli-manifest-v1`，校验器要求四个原生命令的文件集合完整且名称正确。SHA256 是只读字节校验，不是来源签名；不管理 prefix 中其他软件文件。

生成发行归档（Python 3.9+，标准库）：

```sh
python3 "$D/bundle.py" --build /absolute/path/core/build-analysis --config Release --component AnalysisCLI --output /absolute/path/dft-analysis.tar.gz
```

输出必须不存在；工具从标准组件临时安装、验证后无覆盖发布完整相对路径归档，拒绝 sanitizer 发行包。不承诺恶意并发文件系统路径切换安全。
原 `WrapperCLI` 组件、share/dft-wrapper、v1 清单与旧命令仍可使用。`bundle.py` 不指定 `--component` 时继续默认 `WrapperCLI`；生成完整套件必须显式指定 `AnalysisCLI`。
两个组件可以装在同一 prefix，共用原生工具字节，各自保留数据目录和清单；更新构建后应重装需要使用的组件并重新校验，不自动更新另一组件清单。

四个命令也可直接把报告保存到新文件：

```sh
"$P/bin/dft-wrapper" --output /absolute/path/diagnosis.txt -- --top wrapper_example "$D/examples/example.sv" --config "$D/examples/chains.json" --explain-chains --format text --require-complete
```

`--output FILE --` 必须放在命令最前。后续原参数保持原含义，包括文本过滤值 `--output`。父目录须已存在，目标须不存在；不会截断已有报告、输入或链接。
文件保留原JSON/text字节，stdout不重复报告；完整/检查失败/partial仍返回原0/1/4。参数/设计/执行错误仍在控制台，目标不发布。
同父临时文件完成关闭后以无覆盖hard link发布；不支持hard link的文件系统明确失败。强制终止可能留下.dft-report-*临时目录，不承诺断电持久性或恶意并发路径替换安全。

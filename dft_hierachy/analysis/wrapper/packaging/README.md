# Wrapper CLI 本地安装包

本工具包提供现有 Wrapper 检查、可读诊断与声明定位。它对应 Studio Scan 后端的一项独立 CLI 交付，不代表 Studio 页面、计划保存或生成产物已完成。

构建和安装（在 Hierarchy 仓库根目录）：

```sh
cmake -S core -B core/build-analysis -DHIER_BUILD_ANALYSIS=ON -DHIER_BUILD_EXPERIMENTS=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build core/build-analysis --target dft-wrapper -j 4
cmake --install core/build-analysis --component WrapperCLI --prefix /absolute/path/wrapper-cli
```

已有安装树可以整体搬移。原生可执行程序仅要求构建目标平台/架构和系统运行库，不依赖 Python、Node、源码树或构建目录。自定义构建引入的其他动态库须由构建者负责；本包不提供跨平台通用二进制、签名或公证。

相对 GNUInstallDirs 中的 `./`、内部 `./`、重复/末尾 `/` 会规范化后同时用于安装和清单，空格/Unicode 保留，`.` 表示 prefix 根目录。
绝对路径、`..`、驱动前缀和 CMake 控制字符在配置时拒绝，不通过放宽清单校验来接受不安全路径。
目录及构建元数据须为合法 UTF-8，配置/清单生成拒绝 C0/C1 控制字符。正常 Unicode 保留原字节；元数据中的引号、反斜杠和类似 CMake 的文本按数据准确转义。

共享归档器规范 tar/gzip 元数据：同一清单和文件内容、同一 Python/zlib 工具链重复打包得到相同字节。
成员按路径排序，时间与用户/组字段清空，程序权限0755、数据0644；不记录临时文件名。不同压缩库版本不承诺相同压缩字节。

以下示例使用默认 bin/share 安装目录；如自定义 GNUInstallDirs，请按实际目录调整：

```sh
P=/absolute/path/wrapper-cli
D="$P/share/dft-wrapper"
python3 "$D/verify.py" --prefix "$P"
"$P/bin/dft-wrapper" --top wrapper_example "$D/examples/example.sv" --config "$D/examples/chains.json" --explain-chains --format text --require-complete
"$P/bin/dft-wrapper" --top wrapper_example "$D/examples/example.sv" --config "$D/examples/excluded.json" --explain-chains --format text --require-complete
```

第一份配置把要求相反复位电平的两个状态放进同一链，诊断显示 `conflicting_levels` 及端口/状态声明位置。第二份配置显式排除端口 b 后复验；这是更改参与集合，不是自动修复 RTL。

`--require-complete` 只检查证据完整性：完整的已知冲突仍可能退出 0，partial 退出 4。不要把退出 0 当作整个芯片、扫描协议或物理时序通过。错误保持 JSON 和原退出码；`--format text` 只用于 `--explain-chains`，默认仍是 JSON。

Schema 集合在 `schemas/wrapper`、`schemas/sequential` 和 `schemas/protocol`。使用者应按每份文档的 `$id` 建立本地 registry；原 URI 不改写，不要求联网获取依赖。

生成归档（Python 3.9+，标准库；在源码树中使用同一 bundle.py 也可）：

```sh
python3 "$D/bundle.py" --build /absolute/path/core/build-analysis --config Release --output /absolute/path/dft-wrapper.tar.gz
```

工具从标准 CMake 组件安装到临时目录，校验后生成相对路径归档。输出必须不存在；失败不会覆盖旧归档或发布半文件。sanitizer 构建可本机安装调试，但不能生成发行归档。

`bundle.py` 默认继续选择 WrapperCLI。需要四工具套件时，先构建四个命令，再显式使用 `--component AnalysisCLI`；
该组件使用独立 share/dft-analysis 数据树和套件清单，详见源码树 analysis/packaging/README.md。两个组件可装在同一 prefix。

`manifest.json` 是本组件文件的字节清单，包含相对路径、大小、SHA256、文件种类和构建元数据；清单自身不自哈希。校验只读，检测丢失、修改、非法清单或 payload 链接；它不是签名或来源认证，也不管理安装 prefix 中的其他软件文件。归档和清单不构成恶意并发文件系统操作的安全保证。

需要保存诊断时，在原命令最前加 `--output /absolute/path/report.txt --`，原 `--format text`/JSON 参数放在分隔符后。
父目录须存在、目标必须是新路径；完整报告/partial保留原退出码，stdout不重复，执行错误仍在控制台且不生成报告。不会覆盖现有文件或链接。
导出用同父临时文件和无覆盖hard link；不支持hard link时失败，强制终止可能留临时目录，不作断电持久性保证。

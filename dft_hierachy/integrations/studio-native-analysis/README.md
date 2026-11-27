# Studio 原生分析任务接线

这是对现有非 Git `dft_studio` 目录的固定生产增量，不是第二份运行时实现。
`studio.patch.gz` 包含真实修改的20个文件；`delivery.json` 固定160份修改前源码、165份修改后源码和两个原依赖包。
原打包器省略的`.gitignore`只用于本地源码保护；完整产品副本可缺该非运行文件，其余清单仍逐字核验。
新命令 `analyze native` 接入原单写者 RunService、日志、产物、取消及当前输入重跑；不替换浏览 Core 或旧寄存器统计。
正式契约见 [DESIGN7.56](../../docs/DESIGN.md)，实现与实际验证见 [执行计划](../../docs/plans/studio-native-analysis-runs.md)。

已应用的当前工作目录可核验：

```sh
python3 integrations/studio-native-analysis/apply.py --studio /absolute/dft_studio --verify
```

在完整旧 Studio 产品副本上重放（有不同源码会拒绝，保留已有修改）：

```sh
python3 integrations/studio-native-analysis/apply.py --studio /absolute/studio-copy --check
python3 integrations/studio-native-analysis/apply.py --studio /absolute/studio-copy
cd /absolute/studio-copy
npm ci --ignore-scripts
python3 tools/install_native_analysis.py
npm run verify:native-analysis
npm run build:desktop
```

`--check`只做预检；补丁不初始化Git仓库。解包后的普通产品已带native文件，开发重放时才需从本地归档生成。
当前只支持macOS arm64；Node要求沿Studio的24或更新版本。Node包0.3.1和82文件原生发行物保留原许可、清单及摘要。
原0/1/4报告、2/3/5/130后端错误保留原码；历史结果不依赖原生程序仍可执行，freshness始终unknown。
GUI可读CLI创建的原生历史并重跑；新分析表单、专用源码/修复交互及Tcl启动未交付，不冒完整S2/S3/S4。

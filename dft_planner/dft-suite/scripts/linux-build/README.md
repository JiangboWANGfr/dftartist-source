# Linux x86_64 AppImage 构建流水线（服务器 + Docker）

在一台 x86_64 Linux 服务器上用 `ubuntu:24.04` 容器构建 dft-core 与 AppImage，
产物与目标 Ubuntu 24.04 的 glibc/libstdc++ 完全一致。宿主机系统版本无所谓
（实测 Ubuntu 20.04 宿主 + Docker 26 可用），但**必须是 x86_64**。

首次全流程约 1 小时（slang 编译占大头）；此后重打只需 step-dftcore + step-appimage，约 10 分钟。

## 目录约定（服务器）

```
~/build/
  dft-core/        # git clone 自 bundle（分支 main）
  dft-suite/       # git clone 自 bundle（发布分支）
  slang.bundle     # slang 全量 bundle（Mac 传入，一次性）
  slang-src/       # step-slang 从 bundle clone
  opt/slang-10.0.101/   # Linux slang 安装（一次性，长期复用）
  oracle/          # 差分验证用（可选）：tools/*.py + newProject/test/fixtures/chip.*
  out/bin/         # dft-core 五个二进制产物
  logs/            # 各步骤日志
  steps/           # 本目录的脚本
```

## 一次性准备

1. 服务器装 docker、配镜像源（国内需要）：`/etc/docker/daemon.json` 加
   `{"registry-mirrors":["https://mirror.ccs.tencentyun.com","https://docker.m.daocloud.io"]}`。
   内存 <8G 时建 4G swapfile。
2. Mac 打 bundle 并上传（服务器通常连不上 github，全部经 Mac 中转）：
   ```bash
   git -C dft-core  bundle create dft-core.bundle main
   git -C dft-suite bundle create dft-suite.bundle <发布分支>
   git clone https://github.com/MikePopoloski/slang.git && git -C slang bundle create slang.bundle --all
   scp *.bundle server:~/build/  &&  scp scripts/linux-build/* server:~/build/steps/
   ```
3. 服务器 clone + 建镜像：
   ```bash
   cd ~/build && git clone dft-core.bundle -b main dft-core && git clone dft-suite.bundle -b <分支> dft-suite
   cd ~/build/steps && sudo docker build -t dftbuild:2404 . && sudo docker build -f Dockerfile.node -t dftbuild:2404-node .
   ```
4. 编 slang（一次性，~30-60 分钟）：
   ```bash
   sudo docker run --rm -v ~/build:/work dftbuild:2404 bash /work/steps/step-slang.sh
   ```
   脚本会把 v10.0 后第 101 个 commit checkout 出来（= vendored 的 10.0.101），并补装 external 头。

## 每次发布

```bash
# 更新源码：Mac 重打 dft-core/dft-suite bundle 上传，服务器仓库 fetch bundle 后 reset
sudo docker run --rm -v ~/build:/work dftbuild:2404      bash /work/steps/step-dftcore.sh   # 编内核+ctest
sudo docker run --rm -v ~/build:/work dftbuild:2404      bash /work/steps/step-verify.sh    # (可选)pyslang 差分补验
sudo docker run --rm -v ~/build:/work dftbuild:2404-node bash /work/steps/step-appimage.sh  # npm ci+打包
sudo docker run --rm -v ~/build:/work dftbuild:2404-node bash /work/steps/step-smoke.sh     # 无头冒烟
scp server:~/build/dft-suite/release/*.AppImage release/   # 取回产物
```

## 说明

- **step-verify.sh**：ctest 里 5 个差分测试依赖 Mac 侧 oracle（pyslang + Hierarchyshower/tools 脚本 +
  newProject fixtures），容器里没有会失败——step-dftcore 已把产物拷出后才跑 ctest。要完整验证就把
  oracle 文件放到 `~/build/oracle/`（布局见上）再跑本脚本；2026-07-21 实测五项全 MATCH。
- **step-smoke.sh**：容器内 xvfb 启动 AppImage 并带 `--projectpath/--harden/--filelist`，断言
  `.dftproj` 自动落盘——对生产包的端到端验证。
- 所有网络下载走国内镜像：apt=腾讯、node/electron/npm=npmmirror、pip=腾讯。

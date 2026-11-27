# dft-core Linux x86_64 构建环境：与目标 Ubuntu 24.04 完全一致的 glibc/libstdc++。
# 附带 xvfb + electron 运行库，供 AppImage 无头冒烟。
FROM ubuntu:24.04
RUN sed -i 's|http://archive.ubuntu.com|http://mirrors.cloud.tencent.com|g; s|http://security.ubuntu.com|http://mirrors.cloud.tencent.com|g' /etc/apt/sources.list.d/ubuntu.sources \
 && apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    g++ cmake ninja-build git ca-certificates file python3 \
    xvfb libgtk-3-0t64 libnss3 libasound2t64 libxss1 libgbm1 libxtst6 dbus \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work

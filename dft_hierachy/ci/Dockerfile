# GCC 13.4 includes the ASan FakeStack cleanup fix (upstream r13-9350).
# Keep Ubuntu 24.04; pin the compiler image independently of distro GCC 13.3.
FROM gcc:13.4@sha256:3617a214e52a25bde5375dc9503b5e67f01b6c7322a30137e2790aa8e6db5d1f AS toolchain
FROM ubuntu:24.04
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      binutils make libc6-dev libzstd1 cmake git python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=toolchain /usr/local/ /usr/local/
RUN printf '%s\n' /usr/local/lib64 > /etc/ld.so.conf.d/hier-gcc.conf && ldconfig
ENV CC=/usr/local/bin/gcc CXX=/usr/local/bin/g++

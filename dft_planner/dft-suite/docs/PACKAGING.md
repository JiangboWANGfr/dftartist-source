# Packaging dft-suite as a Linux AppImage

## Requirements

A runnable AppImage must bundle **Linux x64** versions of the `hdl` and `genconn`
binaries from dft-core.  These cannot be cross-compiled from macOS — they must be
built on a Linux x64 host (or in a Linux Docker container).

## Steps to produce a runnable AppImage

### 1. Build dft-core on Linux x64

dft-core uses a vendored copy of slang (the SystemVerilog frontend).  On a Linux
x64 machine:

```bash
# From the dft-core repo root:
cmake -B build -S . -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc)
# Produces: build/hdl  build/genconn
```

### 2. Stage the Linux binaries

From the dft-suite repo root, point `DFT_CORE_BUILD` at the dft-core build
directory and run the staging script:

```bash
DFT_CORE_BUILD=/path/to/dft-core/build bash scripts/stage-bin.sh
# Copies hdl + genconn into resources/bin/
```

If `DFT_CORE_BUILD` is not set, the script defaults to `../dft-core/build`
(assumes dft-core is a sibling directory of dft-suite).

### 3. Build and package

```bash
npm run build:desktop
# Equivalent to: bash scripts/stage-bin.sh && npm run build && electron-builder --linux AppImage --x64
# Produces: release/dft-suite-0.1.0-x64.AppImage
```

## macOS development workflow

On macOS you cannot produce a runnable AppImage, but you can develop and run the
Electron UI against a local macOS dft-core build:

```bash
# Build dft-core on macOS first (produces build/hdl and build/genconn as macOS binaries)
DFT_CORE_BIN_DIR=/path/to/dft-core/build npm run dev:electron
```

`electron/bin.cjs` `resolveBin()` checks `DFT_CORE_BIN_DIR` first, then falls
back to the dev-mode sibling path (`../../dft-core/build` relative to
`electron/main.cjs`), and finally to `process.resourcesPath/bin` for the
packaged production AppImage.

## CI

`.github/workflows/ci.yml` runs tests on `ubuntu-latest`.  The `package` job
builds and uploads the AppImage.  Uncomment the dft-core build steps in that
file once the runner has access to the dft-core source.

## Known limitation on macOS

`electron-builder --linux AppImage --x64` on macOS may require Docker or a Linux
toolchain to finalize the AppImage runtime.  The packaging config and scripts are
correct; the env limitation is that the resulting AppImage would bundle macOS
binaries and be un-runnable on Linux.  Build on Linux (or in CI) for a
production artifact.

## 启动参数

打包产物(及 dev 模式)支持：

    ./dft-suite-<ver>-x86_64.AppImage --projectpath /path/to/proj --harden top_a [--filelist /path/to/x.f]

- `--projectpath` + `--harden`(必须成对)：`<projectpath>/<harden>` 即工程目录(.dftproj 与 Arch/、Spec/ 等产物树根)，不存在会自动创建；目录下已有 `.dftproj` 则直接打开。
- `--filelist`(可选)：启动即打开设计并自动建工程；不传则进软件后 load filelist 时自动在上述目录建工程(不再弹目录选择)。已有工程且 CLI filelist 不一致时以命令行为准并写回。
- 同时支持 `--key=value` 写法；相对路径按启动时 cwd 解析。
- 只传 `--projectpath`/`--harden` 其一：stderr 打印 usage 并以码 2 退出。


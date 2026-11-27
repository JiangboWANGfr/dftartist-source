#!/bin/zsh
cd /Users/jiangbowang/MOI/2025/dftartist/2026.9/dft_planner/dft-suite
env -u ELECTRON_RUN_AS_NODE -u ELECTRON_DEV DFT_CORE_BIN_DIR="/Users/jiangbowang/Library/Application Support/dft-suite-local/nx9000-rg3nwewg/bin" ./node_modules/.bin/electron electron/main.cjs --user-data-dir="/Users/jiangbowang/Library/Application Support/dft-suite-local/nx9000-rg3nwewg/profile" --projectpath /Users/jiangbowang/MOI/2025/dftartist/2026.9/nx9000 --harden processor_core

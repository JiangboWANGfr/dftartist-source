#!/usr/bin/env bash
# Builds and tests the C++ side inside a Linux container (GCC 13.4, Ubuntu 24.04).
#
# The source tree is mounted read-only; build output lives in a Docker volume, so
# nothing is written into the working tree and rebuilds are incremental.
#
#   ci/linux.sh                 native architecture of this machine's Docker
#   PLATFORM=linux/amd64 ci/linux.sh   x86_64 (emulated and slow on an ARM host)
#
# On an ARM Mac the native run is arm64 Linux: it checks "Linux + GCC", not x86_64.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
PLATFORM=${PLATFORM:-}
JOBS=${JOBS:-6}
TAG=hier-ci:ubuntu24.04-gcc13.4
VOLUME=hier-ci-gcc13.4-build${PLATFORM:+-${PLATFORM//\//-}}

docker build ${PLATFORM:+--platform "$PLATFORM"} -q -t "$TAG" "$ROOT/ci" > /dev/null
docker run --rm ${PLATFORM:+--platform "$PLATFORM"} \
  -v "$ROOT":/src:ro -v "$VOLUME":/build -e JOBS="$JOBS" "$TAG" bash -euo pipefail -c '
    echo "container: $(uname -m), $(gcc --version | head -1), $(cmake --version | head -1)"
    # Reject the GCC 13.3 FakeStack leak without disabling sanitizer checks.
    g++ -std=c++20 -O2 -g -fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=undefined \
      /src/ci/sanitizer-stack-probe.cpp -o /build/sanitizer-stack-probe
    /build/sanitizer-stack-probe
    # Test-only tools, isolated from the system Python and production targets.
    [ -x /build/schema-venv/bin/python ] || python3 -m venv /build/schema-venv
    /build/schema-venv/bin/python -m pip install --disable-pip-version-check -q -r /src/protocol/schema/tests/requirements.txt
    for cfg in "release -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_TEST_OBSERVER=OFF" \
               "debug -DCMAKE_BUILD_TYPE=Debug -DHIER_TEST_OBSERVER=ON" \
               "asan -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_SANITIZE=ON -DHIER_TEST_OBSERVER=ON"; do
      name=${cfg%% *}; opts=${cfg#* }
      echo "--- $name: build"
      cmake -S /src/core -B /build/$name -DHIER_TEST_M3=ON -DHIER_TEST_FUTURE=ON -DHIER_SCHEMA_PYTHON=/build/schema-venv/bin/python $opts > /build/$name.configure.log 2>&1 \
        || { tail -30 /build/$name.configure.log; exit 1; }
      cmake --build /build/$name -j "$JOBS" > /build/$name.build.log 2>&1 \
        || { grep -E "error|Error" /build/$name.build.log | head -40; exit 1; }
      echo "--- $name: tests"
      ctest --test-dir /build/$name --output-on-failure -j "$JOBS" > /build/$name.ctest.log 2>&1 \
        || { cat /build/$name.ctest.log; exit 1; }
      tail -8 /build/$name.ctest.log
    done
  '

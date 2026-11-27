#!/usr/bin/env bash
# One command for every check this project has. Whatever CI runs later should call this.
#
#   ./check.sh                 the checks every change must pass (about 1 minute warm)
#   ./check.sh --designs VC DIR  also regress on real designs:
#                              VC  = nx9000 processor_core.vc, DIR = openc910 design dir
#   ./check.sh --linux         also build and test inside a Linux container (needs Docker)
#
# Every change:
#   - optimised, Debug and sanitizer (ASan + UBSan) builds, warnings as errors
#   - all C++ tests in each of the three builds; private observers in Debug/ASan
#   - TypeScript type check, layer rules, and the tests that the layer rules reject
#     violations
# Any failure stops the script with a non-zero exit status.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd -P)
JOBS=${JOBS:-8}
DESIGNS=0; LINUX=0; PC_VC=""; OC_DESIGN=""
while [ $# -gt 0 ]; do
  case $1 in
    --designs) [ $# -ge 3 ] || { echo "check.sh: --designs needs two paths" >&2; exit 2; }
               DESIGNS=1; PC_VC=$2; OC_DESIGN=$3; shift 3 ;;
    --linux)   LINUX=1; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "check.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done

HIER_SCHEMA_PYTHON=${HIER_SCHEMA_PYTHON:-python3}
HIER_SCHEMA_PYTHON=$("$HIER_SCHEMA_PYTHON" -c 'import sys; print(sys.executable)')
"$HIER_SCHEMA_PYTHON" -c 'import jsonschema' || {
  echo "Install protocol/schema/tests/requirements.txt in a venv and set HIER_SCHEMA_PYTHON to its Python." >&2
  exit 1
}
export HIER_SCHEMA_PYTHON

step() { printf '\n=== %s\n' "$*"; }

build_and_test() {  # name, cmake options...
  local name=$1; shift
  step "C++ $name: build"
  cmake -S "$ROOT/core" -B "$ROOT/core/$name" -DHIER_TEST_M3=ON -DHIER_TEST_FUTURE=ON -DHIER_SCHEMA_PYTHON="$HIER_SCHEMA_PYTHON" "$@" > /dev/null
  cmake --build "$ROOT/core/$name" -j "$JOBS" > "$ROOT/core/$name/build.log" 2>&1 || {
    grep -E "error|Error" "$ROOT/core/$name/build.log" | head -40 >&2
    echo "check.sh: build failed, full log in core/$name/build.log" >&2; exit 1; }
  step "C++ $name: tests"
  ctest --test-dir "$ROOT/core/$name" --output-on-failure -j "$JOBS" > "$ROOT/core/$name/ctest.log" 2>&1 || {
    cat "$ROOT/core/$name/ctest.log" >&2
    exit 1
  }
  tail -8 "$ROOT/core/$name/ctest.log"
}

# Keep the production configuration free of instrumentation, and always exercise
# the private deterministic gates in Debug/ASan, including on a fresh checkout.
# Do not let an old local CMake cache silently choose which gates run.
build_and_test build       -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_TEST_OBSERVER=OFF
build_and_test build-debug -DCMAKE_BUILD_TYPE=Debug -DHIER_TEST_OBSERVER=ON
build_and_test build-asan  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DHIER_SANITIZE=ON -DHIER_TEST_OBSERVER=ON

step "TypeScript: types, layer rules, layer-rule tests"
(cd "$ROOT/web" && npm install --silent --no-audit --no-fund && npm run --silent check)

step "M7: measurement tools, failure reporting and artifact preservation"
(cd "$ROOT/web" && npm run --silent test:performance-tools)

step "M7: selection display membership and public component regressions"
(cd "$ROOT/web" && npm run --silent test:selection-display)

step "M7: independent resource budgets, demo configuration and public types"
(cd "$ROOT/web" && npm run --silent test:independent:m7)

step "M4: client, independent SDK subset, and real Core session"
(cd "$ROOT/web" && npm run --silent test:client && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m4 &&
  HIER_BIN="$ROOT/core/build/hier" npm run --silent test:core)

step "M5: selection behavior and production type consumers"
(cd "$ROOT/web" && npm run --silent test:independent:m5)

step "M5: independent real Core selection integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:core)

step "M5: tree lifecycle regressions"
(cd "$ROOT/web" && npm run --silent test:viewmodel)

step "M5: independent tree behavior and production type consumers"
(cd "$ROOT/web" && npm run --silent test:independent:m5:tree)

step "M5: independent real Core tree integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:tree:core)

step "M5: independent instance properties and production type consumers"
(cd "$ROOT/web" && npm run --silent test:independent:m5:properties)

step "M5: independent real Core instance properties integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:properties:core)

step "M5: object connections frozen model and production types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:connections)
step "M5: object connections real SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:connections:core)
step "M5: object connections fixture controls"
(cd "$ROOT/web" && npm run --silent test:independent:m5:connections:controls)

step "M5: renderer Transport and real SDK units (not Electron IPC)"
(cd "$ROOT/web" && npm run --silent test:independent:m5:electron-renderer)

step "M5: source document data model and production types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source)

step "M5: independent source document SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:source:core)

step "M5: source candidate pagination and production types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:candidates)

step "M5: independent source candidates SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:candidates:core)

step "M5: current source document point queries and production types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-position)

step "M5: independent source position SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:source-position:core)

step "M5: source position facilities and prior full-text validation regressions"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-position:controls)

step "M5: source navigation coordination and production types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-navigation)

step "M5: independent source navigation SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:source-navigation:core)

step "M5: source navigation facilities and ready-event baseline controls"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-navigation:controls)

step "M5: independent source confirmation behavior and public types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-confirmation)

step "M5: source confirmation facilities and clarified synchronous boundaries"
(cd "$ROOT/web" && npm run --silent test:source-confirmation:controls)

step "M5: source confirmation real SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:source-confirmation:core)

step "M5: SourceView production types and browser behavior"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-view)

step "M5: SourceView outside tarball, React peer and CSS consumption"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-view:package)

step "M5: SourceView fixture and standard-entry controls"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-view:controls)

step "M5: SourceHit refKind types, schema, SDK and legacy schema7"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-ref-kind && npm run --silent test:independent:m5:source-ref-kind:controls)
step "M5: SourceHit refKind real SDK/Node/Core"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:source-ref-kind:core)
for cfg in build build-debug build-asan; do
  step "M5: SourceHit refKind native consumers ($cfg)"
  node "$ROOT/web/scripts/run-source-ref-kind-tests.mjs" native "$ROOT/core/$cfg"
done

step "M5: SourceCandidatesView production types and frozen browser behavior"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-candidates-view)
step "M5: SourceCandidatesView outside tarball, CSS and React peer"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-candidates-view:package)
step "M5: SourceCandidatesView frozen facility controls"
(cd "$ROOT/web" && npm run --silent test:independent:m5:source-candidates-view:controls)

step "M5: PropertiesPanel production types and frozen browser/Core behavior"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:properties-panel)
step "M5: PropertiesPanel outside tarball, CSS and React peer"
(cd "$ROOT/web" && npm run --silent test:independent:m5:properties-panel:package)
step "M5: PropertiesPanel frozen fixture controls"
(cd "$ROOT/web" && npm run --silent test:independent:m5:properties-panel:controls)

step "M5: ObjectConnectionsView production types and frozen browser/Core behavior"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:connections-view)
step "M5: ObjectConnectionsView outside tarball, CSS and React peer"
(cd "$ROOT/web" && npm run --silent test:independent:m5:connections-view:package)
step "M5: ObjectConnectionsView frozen fixture controls"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:connections-view:controls)

step "M5: SearchModel original pages, lifecycle and production types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:search)
step "M5: SearchModel real SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:search:core)
step "M5: SearchModel fixture and SDK/Core controls"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:search:controls)

step "M5: SearchResultsView production types and frozen browser/Core behavior"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:search-results-view)
step "M5: SearchResultsView outside tarball, CSS and React peer"
(cd "$ROOT/web" && npm run --silent test:independent:m5:search-results-view:package)
step "M5: SearchResultsView frozen fixture controls"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:search-results-view:controls)

step "M5: DefinitionInstancesModel original pages, lifecycle and production types"
(cd "$ROOT/web" && npm run --silent test:independent:m5:definition-instances)
step "M5: DefinitionInstancesModel real SDK/Node/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:definition-instances:core)
step "M5: DefinitionInstancesModel fixture and SDK/Core controls"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:definition-instances:controls)

step "M5: DefinitionInstancesView production types and frozen browser/Core behavior"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:definition-instances-view)
step "M5: DefinitionInstancesView outside tarball, CSS and React peer"
(cd "$ROOT/web" && npm run --silent test:independent:m5:definition-instances-view:package)
step "M5: DefinitionInstancesView frozen fixture controls"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:definition-instances-view:controls)

step "M5: PathResolutionModel and View production types, frozen behavior and Core chain"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:path-resolution)
step "M5: PathResolution outside tarball, CSS and React peer"
(cd "$ROOT/web" && npm run --silent test:independent:m5:path-resolution:package)
step "M5: PathResolution frozen model and SDK/Core controls"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:path-resolution:controls)

step "M5: Electron main/preload types, host units and private text regressions"
(cd "$ROOT/web" && npm run --silent test:independent:m5:electron-host)
step "M5: Electron private text real Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:electron-host:core)
step "M5: real sandbox Electron contextBridge/SDK/Core integration"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:electron-host:e2e)

step "M6: GraphSession production types, source ownership and real SDK/Core"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m6:graph)

step "M6: LayoutService production types, lifecycle and outside native Worker/CSP"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m6:layout)

step "M6: SchematicView projection, types, native Worker and browser interaction"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m6:schematic)

step "M6 shared annotations: independent model/types/tree and schematic views"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m6:annotations)

step "M6 folded projection: independent model/types/legal input"
(cd "$ROOT/web" && npm run --silent test:independent:m6:fold)

step "M6 folded layout/view: independent types/model/DOM/native ELK"
(cd "$ROOT/web" && npm run --silent test:independent:m6:fold-layout-view)

step "M7: independent real Electron resource errors, reopen and off policy"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m7:electron)

step "M5: fixed demo build, production types and real Electron composition"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:demo)

step "M6: A real demo trace/source/graph and native Worker lifecycle regression"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:demo-graph)

step "M5: HierarchyTree production types, errors and frozen browser/Core behavior"
(cd "$ROOT/web" && HIER_BIN="$ROOT/core/build/hier" npm run --silent test:independent:m5:tree-view)

if [ "$DESIGNS" = 1 ]; then
  [ -f "$PC_VC" ] || { echo "check.sh: no such file: $PC_VC" >&2; exit 2; }
  [ -f "$OC_DESIGN/filelists/C910_asic_rtl.fl" ] || { echo "check.sh: not an openc910 design dir: $OC_DESIGN" >&2; exit 2; }
  PC_VC=$(cd "$(dirname "$PC_VC")" && pwd -P)/$(basename "$PC_VC")
  OC_DESIGN=$(cd "$OC_DESIGN" && pwd -P)
  mkdir -p "$ROOT/core/build/openc910_base"
  ln -sfn "$OC_DESIGN" "$ROOT/core/build/openc910_base/gen_rtl"
  export CODE_BASE_PATH=$ROOT/core/build/openc910_base
  for cfg in build build-asan; do
    step "designs ($cfg): shared and per-instance extraction agree"
    "$ROOT/core/$cfg/hier" verify-sharing -f "$PC_VC" --top processor_core
    "$ROOT/core/$cfg/hier" verify-sharing -f "$OC_DESIGN/filelists/C910_asic_rtl.fl" --top openC910
    "$ROOT/core/$cfg/hier" verify-facts -f "$PC_VC" --top processor_core
    "$ROOT/core/$cfg/hier" verify-facts -f "$OC_DESIGN/filelists/C910_asic_rtl.fl" --top openC910
    "$ROOT/core/$cfg/hier" verify-facts --per-instance-bodies -f "$PC_VC" --top processor_core
    "$ROOT/core/$cfg/hier" verify-facts --per-instance-bodies -f "$OC_DESIGN/filelists/C910_asic_rtl.fl" --top openC910
  done
fi

if [ "$LINUX" = 1 ]; then
  step "Linux container: build and test"
  "$ROOT/ci/linux.sh"
fi

step "all checks passed"
[ "$DESIGNS" = 1 ] || echo "(real-design regression not run: pass --designs VC DIR)"
[ "$LINUX" = 1 ] || echo "(Linux build not run: pass --linux)"

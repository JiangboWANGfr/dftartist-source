#!/usr/bin/env bash
# NDJSON smoke: pad.table + pad.generate + unknown-method error.
# usage: pad_serve.sh <fixtures/pad dir> <rtl/pad dir>
set -euo pipefail
PAD=${PAD:?}
FIX=$1
RTL=$2

out=$("$PAD" serve <<EOF
{"id":1,"method":"pad.table","params":{"filelist":"$RTL/mini_chip.f","lib":"$FIX/mini.tcelllib"}}
{"id":2,"method":"pad.generate","params":{"filelist":"$RTL/mini_chip.f","lib":"$FIX/mini.tcelllib","config":"{\"pads\":{\"mini_chip.u_gpio0\":{\"reuse\":\"in\"}}}","level":"chip"}}
{"id":3,"method":"pad.nope","params":{}}
EOF
)

echo "$out" | sed -n 1p | grep -q '"id":1,"result":{"pads":\['
echo "$out" | sed -n 1p | grep -q '"path":"mini_chip.u_clk_pad"'
echo "$out" | sed -n 2p | grep -q '"outputA":"read_config_data'
echo "$out" | sed -n 2p | grep -q 'internal_auxiliary_input_ports : GPIO_0'
echo "$out" | sed -n 3p | grep -q '"id":3,"error":"unknown method: pad.nope"'
echo "pad serve OK"

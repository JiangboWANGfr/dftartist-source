#!/bin/bash
# Shared configuration for the stress / regression tools. Everything is overridable by env, so
# these scripts are not tied to one machine — set DESIGN_VC (and DESIGN_SDC) to point at whatever
# design you want to exercise.
#
#   HDL         the built daemon binary
#   DESIGN_VC   filelist of the design under test
#   DESIGN_SDC  functional SDC (optional; without it everything reads Z/X, which is still a
#               valid structural run)
#   DESIGN_LIB  dft_lib_setting.yaml (optional; without it the walk stops at the first clock cell)

_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${HDL:=$_here/../../build-linux/hdl}"
: "${DESIGN_VC:=}"
: "${DESIGN_SDC:=}"
: "${DESIGN_LIB:=}"

need_design() {
  if [ -z "$DESIGN_VC" ] || [ ! -f "$DESIGN_VC" ]; then
    echo "set DESIGN_VC to a filelist (and optionally DESIGN_SDC / DESIGN_LIB)" >&2
    exit 2
  fi
  if [ ! -x "$HDL" ]; then
    echo "no daemon binary at $HDL — build it first (ninja -C build-linux)" >&2
    exit 2
  fi
}

# params json for a clock-reset-tree request, honouring the optional SDC/lib
cr_params() {
  printf '{"sdcFile":"%s","dftLibSetting":"%s"%s}' "$DESIGN_SDC" "$DESIGN_LIB" "$1"
}

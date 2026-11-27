// B-only legal JSON fixtures from Schema7, never product state or a substitute View.
export const ref = "B58:查询<&>",
  other = "B58:另一个";
export const complete = { status: "complete", reasons: [] };
export const partial = {
  status: "partial",
  reasons: [
    { code: "unsupported", at: "B58:停下<&>", detail: "" },
    { code: "interface_port", at: "B58:接口", detail: "接口<&>" },
    { code: "unsupported", at: "B58:停下<&>", detail: "" },
  ],
};
export const target = (extra = {}) => ({
  slice: { ref },
  reach: "hier",
  ...extra,
});
export const info = (r = ref) => ({
  ref: r,
  name: '目标<img src=x onerror="window.B58Injected=1">&尾',
  pathText: "\\top .\\路径.尾 ",
  kind: "signal",
  inst: "B58:owner",
  B_ignored: "DO-NOT-DISPLAY-B58-EXTENSION",
});
const bits = (lsb = 0, width = 2) => ({ lsb, width });
export const endpoints = () => [
  {
    kind: "process",
    queried: bits(0, 3),
    ref: "B58:process",
    inst: "B58:owner",
    bits: bits(6, 3),
    at: { ref: "B58:作用信号-not-process", bits: bits(6, 3) },
    via: [
      {
        kind: "boundary",
        from: { ref, bits: bits(0, 3) },
        via: "B58:boundary-pin",
        map: [
          { from: 0, to: 6, width: 2 },
          { from: 2, to: 8, width: 1 },
        ],
        next: [
          {
            slice: { ref: "B58:next", bits: bits(6) },
            role: "data",
            precision: "exact",
          },
          {
            slice: { ref: "B58:next2", bits: bits(8, 1) },
            role: "control",
            precision: "conservative",
          },
        ],
      },
    ],
    source: {
      file: "B58:file",
      path: "/B58/源码<&>.sv",
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 8, line: 2, column: 3 },
      contentHash: "0123456789abcdef".repeat(4),
    },
    B_ignored: "DO-NOT-DISPLAY-B58-EXTENSION",
  },
  {
    kind: "process",
    queried: bits(3, 1),
    ref: "B58:process",
    inst: "B58:owner",
    bits: bits(9, 1),
    at: { ref: "B58:另作用信号", bits: bits(9, 1) },
    via: [],
  },
  {
    kind: "module_pin",
    queried: bits(),
    ref: "B58:module-pin",
    inst: "B58:child",
    bits: bits(4),
    via: [],
  },
  {
    kind: "top_port",
    queried: bits(),
    ref: "B58:top-port",
    inst: "B58:owner",
    bits: bits(),
    via: [],
  },
  {
    kind: "own_port",
    queried: bits(),
    ref: "B58:own-port",
    inst: "B58:owner",
    bits: bits(),
    via: [],
  },
  {
    kind: "blackbox_pin",
    queried: bits(0, 0),
    ref: "B58:blackbox-pin",
    inst: "B58:blackbox",
    bits: bits(0, 0),
    via: [],
  },
  {
    kind: "primitive_pin",
    queried: bits(0, 1),
    ref: "B58:primitive-pin",
    inst: "B58:primitive",
    bits: bits(0, 1),
    via: [],
  },
  {
    kind: "const",
    queried: bits(0, 128),
    value: "128'b" + "10xz".repeat(32),
    via: [],
  },
  { kind: "unconnected", queried: bits(0, 1), via: [] },
  {
    kind: "unresolved",
    queried: bits(0, 0),
    reason: "unknown_pin_width",
    via: [],
  },
];

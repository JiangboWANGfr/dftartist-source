import "./dft.d.ts";
import type { CtrlIpSpec } from "../genconn/core/model.ts";

export const dftCtrlgen = {
  gen: (spec: CtrlIpSpec) => window.dft.ctrlgen.gen(spec),
};

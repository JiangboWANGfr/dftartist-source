import "./dft.d.ts";
import type { PadTableResult } from "../hierarchy/core/pad.ts";

export const dftPad = {
  table: (filelist: string, lib: string) =>
    window.dft.pad.table(filelist, lib) as Promise<PadTableResult>,
  gen: (filelist: string, lib: string, cfg: unknown, level: string, aux: string) =>
    window.dft.pad.gen(filelist, lib, cfg, level, aux),
  pickLib: () => window.dft.pad.pickLib(),
  readCfg: (filelist: string) => window.dft.pad.readCfg(filelist),
  writeCfg: (filelist: string, json: string) => window.dft.pad.writeCfg(filelist, json),
  exportText: (defaultName: string, text: string) => window.dft.pad.exportText(defaultName, text),
};

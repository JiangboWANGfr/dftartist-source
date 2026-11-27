import type { DftIpType } from "../genconn/core/dft-model.ts";
import registry from "./schema/datapath.schema.json" with { type: "json" };
import bscanRegistry from "./schema/bscan.schema.json" with { type: "json" };
import jtag1838Registry from "./schema/jtag1838.schema.json" with { type: "json" };

export interface PropSchema { name: string; type: "text" | "enum"; values?: string[]; default?: string; placeholder?: string; spec?: string; }
export interface BlockSchema { name?: string; id: null | { kind: "id" }; props?: PropSchema[]; blocks?: BlockSchema[]; }
interface Registry { datapathProps: PropSchema[]; components: Record<string, BlockSchema>; }

const REG = registry as unknown as Registry;
const BSCAN = (bscanRegistry as unknown as { components: Record<string, BlockSchema> }).components;
const JTAG1838 = (jtag1838Registry as unknown as { components: Record<string, BlockSchema> }).components;

export const datapathComponentNames: DftIpType[] = ["Pipeline","ScanHost","OutputPipeline","Receiver1xPipeline","Multiplexer","Fifo","BusFrequencyDivider","BusFrequencyMultiplier","DesignInstance"];

export function componentSchema(ipType: DftIpType): BlockSchema {
  const s = REG.components[ipType] ?? BSCAN[ipType] ?? JTAG1838[ipType];
  if (!s) throw new Error(`no datapath schema for ${ipType}`);
  return s;
}

export function datapathProps(): PropSchema[] { return REG.datapathProps; }

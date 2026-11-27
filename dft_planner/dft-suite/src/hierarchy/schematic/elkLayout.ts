// Run ELK (standalone bundle, main thread — cones are 5-50 nodes so this is ms-fast;
// a Web Worker is the documented later optimization).

import ELK, { type ElkLaidGraph } from "elkjs/lib/elk.bundled.js";
import type { ElkGraphInput } from "../core/schematic.ts";

const elk = new ELK();
export type LaidOutGraph = ElkLaidGraph;

export const layout = (g: ElkGraphInput): Promise<LaidOutGraph> => elk.layout(g);

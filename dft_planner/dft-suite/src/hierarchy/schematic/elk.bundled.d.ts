// Minimal typings for the standalone (no-worker) elkjs build.
declare module "elkjs/lib/elk.bundled.js" {
  export interface ElkPoint { x: number; y: number; }
  export interface ElkLaidPort { id: string; x?: number; y?: number; width?: number; height?: number; }
  export interface ElkLaidEdgeSection { startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[]; }
  export interface ElkLaidEdge { id: string; sections?: ElkLaidEdgeSection[]; container?: string; }
  export interface ElkLaidNode { id: string; x?: number; y?: number; width?: number; height?: number; ports?: ElkLaidPort[]; children?: ElkLaidNode[]; edges?: ElkLaidEdge[]; }
  export interface ElkLaidGraph { children?: ElkLaidNode[]; edges?: ElkLaidEdge[]; width?: number; height?: number; }
  export default class ELK {
    constructor(opts?: unknown);
    layout(graph: unknown): Promise<ElkLaidGraph>;
  }
}

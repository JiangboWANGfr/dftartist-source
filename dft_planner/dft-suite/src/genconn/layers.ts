// 总线图层（bus-type layers）：图层 = busType，画线时即定；本文件仅纯视图三态判定，不碰 model/生成。

import type { BusInterface } from "./core/model.ts";

export type BusType = BusInterface["busType"];
export const BUS_LAYERS: BusType[] = ["SSN", "IJTAG", "BISR", "BSCAN", "JTAG1838"];
export type LayerState = "normal" | "dim" | "hidden";

/** 图层三态：显式隐藏 > 活动层生效时的非本层(dim) > normal。 */
export function layerStateOf(bt: BusType, activeLayer: BusType | null, hiddenLayers: Set<BusType>): LayerState {
  if (hiddenLayers.has(bt)) return "hidden";
  if (activeLayer && bt !== activeLayer) return "dim";
  return "normal";
}

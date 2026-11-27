// DFT（SpecGen）专用数据类型。纯类型、零逻辑；被 HardenDef 引用，generate 不读。
import type { Id, BusInterface } from "./model.ts";

/** SSN DataPath 可放置的组件类型（= schema 的 SSN.Datapath.blocks 名）；EBScanPipeline 属 BScan 层。 */
export type DftIpType =
  | "Pipeline" | "ScanHost" | "OutputPipeline" | "Receiver1xPipeline"
  | "Multiplexer" | "Fifo" | "BusFrequencyDivider" | "BusFrequencyMultiplier" | "DesignInstance"
  | "Edt" | "EBScanPipeline"
  | "STapPipeline";

/** 一个放在 harden 内部的 DFT IP 实例（叶子，无下钻）。 */
export interface DftIpInstance {
  id: Id;
  ipType: DftIpType;
  instanceName: string;
  position: { x: number; y: number };
  /** 跨层节点（DesignInstance）每层坐标覆盖；缺省回退 position。纯视图，generate 不读。 */
  layerPos?: Partial<Record<BusInterface["busType"], { x: number; y: number }>>;
  /** 属性值，按 schema.props/blocks 填（Slice 2）。 */
  config?: DftConfig;
  /** 顺时针旋转，缺省 0（纯视图，generate 不读）。 */
  rotation?: 0 | 90 | 180 | 270;
  /** 水平镜像，先于旋转，缺省 false（纯视图）。 */
  mirror?: boolean;
  /** DesignInstance 用：对应 harden 的 module 名（= 子 def designName）；生成时作为组件名输出（缺省回退 "DesignInstance"）。 */
  moduleName?: string;
  /** 自动派生自哪个子实例(HardenInstance.id)：有则由 syncDesignInstances 管理(增删/改名)，非用户手动加。 */
  sourceChildId?: Id;
}

/** DFT IP 参数（嵌套 overrides，只存改过的）：标量→string；单例块→DftConfig；id 列表块→DftConfigListItem[]。 */
export interface DftConfig { [key: string]: string | DftConfig | DftConfigListItem[]; }
export interface DftConfigListItem extends DftConfig { id: string; }

/** datapath 连线端点：DFT IP 端口 或 child 块接口引脚（Slice 3 用）。 */
export type DftEndpoint =
  | { kind: "ip"; ipId: Id; port: string }
  | { kind: "iface"; instanceId: Id; interfaceId: Id; pin: "in" | "out" };

/** IP 端口/接口引脚之间的连线（Slice 3 用）。 */
export interface DftWire {
  id: Id;
  from: DftEndpoint;
  to: DftEndpoint;
  /** 手动正交折点（世界坐标，端口锚点之外的内部顶点）；缺省=自动避障（纯视图）。 */
  waypoints?: { x: number; y: number }[];
}

// GenConnection MVP — 数据模型（对应 spec §2）。
// 纯类型 + 接口；运行时无任何依赖。

import type { DftIpInstance, DftWire } from "./dft-model.ts";

export type Id = string;

export type DesignLevel = "chip" | "physical_block" | "sub_block";
export type DesignType = "hierarchical" | "tiling";
export type BusType = "SSN" | "IJTAG" | "BISR" | "BSCAN" | "JTAG1838";
export type Role = "client" | "secondary";
export type Direction = "input" | "output";

/** 接口展开后的单个端口（派生，不持久化；由 §4 从 BusInterface 算出）。 */
export interface InterfaceSignal {
  name: string;
  direction: Direction;
  /** 1 = 单 bit（渲染不带 [..]）；>1 渲染为 [width-1:0]。 */
  width: number;
}

/** 挂在某个 harden 边界上的一个总线接口（spec §2.2）。 */
export interface BusInterface {
  id: Id;
  busType: BusType;
  role: Role;
  /** <if> 前缀，secondary 必填；client 可空。 */
  interfaceName?: string;
  /** <pd>，仅 BISR 使用；可选。不指定则信号名不带 `<pd>_` 前缀。 */
  powerDomain?: string;
  /** 仅 BISR：true = powerDomain 只用于匹配（仍需精确相等），但不进端口名（信号名不带 `<pd>_`）。 */
  pdMatchOnly?: boolean;
  /** 仅 BISR：true = 不生成 mem_chain_select / mem_disable 两根；连接两端必须相同。 */
  omitMemCtrl?: boolean;
  /** SSN 位宽 W，默认 4。 */
  busWidth?: number;
  /** 仅 BSCAN；连接两端必须相同。 */
  bscanVariant?: "DC" | "AC";
  /** 仅 SSN secondary：接口名放端口名前(prefix)还是后(postfix)。缺省=prefix（原行为，如 `<if>_ssn_to_bus_clock`）。 */
  ifNamePlacement?: "prefix" | "postfix";
  /**
   * 视图信息：接口在边界上的位置，可沿边自由拖动。不影响生成文件。
   *  - 矩形 harden：用 side + offset（offset = 沿该边归一化位置 0..1）。
   *  - 多边形 harden：用 perimeter（沿整条外轮廓的归一化弧长 0..1）；side 由所在边导出。
   * 用于 UI 的"紧贴吸附配对"（相邻 harden 的 secondary/client 对齐即配对）。
   */
  edge?: { side: "top" | "bottom" | "left" | "right"; offset?: number; perimeter?: number };
  /** 提升标记：本边界接口由某子块实例的接口"提升/馈通"而来。仅驱动 TCL + 下层连接文件省略；不改其它生成语义。 */
  portedFrom?: { instanceId: Id; interfaceId: Id };
  /** 视图：接口摆放。缺省/pin=画在 harden 边上；other=画在 harden 内部（仅 client 合法）。不影响生成。 */
  placement?: "pin" | "other";
  /** 视图/语义：true=这是一个 data source（有进/出引脚、可拉线的连接起点），非普通边界接口。不影响生成。 */
  isDataSource?: boolean;
  /** 视图：placement=other 时在盒内的位置（相对盒子原点）。不影响生成。 */
  innerPos?: { x: number; y: number };
  /** 视图：SpecGen 边界接口块的进/出脚翻转（交换 out↔in 两脚），双击切换。不影响生成。 */
  dsFlip?: boolean;
  /** 视图：仅 BISR data source；power domain 列表，每个 pd 渲染成卡片里的一行（一条连接线）。不影响生成（生成靠 wire.pd → powerDomain）。 */
  pdList?: string[];
}

/** 某个 HardenDef 内部实例化的一个子 harden（引用 + 摆位，spec §2.3）。 */
export interface HardenInstance {
  id: Id;
  instanceName: string;
  hardenId: Id;
  position?: { x: number; y: number };
  /**
   * 视图信息：实例摆放朝向。**纯视图，不影响生成**（generate 不读实例几何）。
   *  - rotation：顺时针旋转角度（0/90/180/270，缺省 0）。
   *  - mirror：水平镜像（绕竖直中线翻转，缺省 false），在 rotation 之前应用。
   * 8 种朝向 = rotation × 可选 mirror。
   */
  rotation?: 0 | 90 | 180 | 270;
  mirror?: boolean;
  /**
   * 按接口的 pd 覆盖（仅本实例）：interfaceId → power domain group。
   * 仅用于 BISR 匹配/分组（有效 pd = ifacePd[id] ?? 接口自身 powerDomain），**不进端口名**。
   * 改本实例不影响该 def 的其它实例。
   */
  ifacePd?: Record<Id, string>;
  /** 来源设计层次节点 id(daemon nodeId,点分隔);DFX 配置需要 */
  hierPath?: string;
}

/** 一条 secondary → client 的连接（spec §2.4）。 */
export interface BusConnection {
  id: Id;
  secondaryInstanceId: Id;
  secondaryInterfaceId: Id;
  clientInstanceId: Id;
  clientInterfaceId: Id;
  /** true = 由「画线」显式建立；生成/校验/展开完全忽略；仅 snap 几何对账据此不冲掉手画连接。 */
  manual?: boolean;
}

/** 「画线生成接口」的纯视图记录，挂父 def；不影响生成。 */
export interface BusWire {
  id: Id;
  busType: BusType;
  busWidth?: number;
  /** 起点 data source 接口：实例 + 接口 id。 */
  sourceInstanceId: Id;
  sourceInterfaceId: Id;
  /** 正交折线（open def 坐标系）。 */
  points: { x: number; y: number }[];
  /** 仅 BISR：这条线携带的 power domain（从某个 pd 桩起线时写入）；喂给 wire.ts 的 applyBisrMatchOnly 派生。 */
  pd?: string;
  /** 本 wire 建立的连接 id（删线时删这些连接 + wire 记录）。 */
  connectionIds: Id[];
  /** 本 wire 自动生成的接口（删线后已无任何连接引用 → 一并删；被其他线复用则保留）。老文档可缺省。 */
  createdIfs?: { defId: Id; ifId: Id }[];
  /** 收线端 = DS 的 ◀in 脚（渲染时线端点绑定引脚用）。老文档可缺省 → 只绑起点端。 */
  inInstanceId?: Id;
  inInterfaceId?: Id;
}

/** 一个 harden 定义（= 一个 module / 可复用 IP，spec §2.5）。 */
export interface HardenDef {
  id: Id;
  designName: string;
  designLevel: DesignLevel;
  designType: DesignType;
  fileName?: string;
  interfaces: BusInterface[];
  childInstances: HardenInstance[];
  connections: BusConnection[];
  /**
   * 是否已"保存到模块库"（出现在调色板、可点选复用）。
   * false/缺省 = 临时一次性模块（仅在画布上）。纯库/调色板用途，**不影响生成**。
   */
  inLibrary?: boolean;
  /** 视图信息：矩形尺寸（无 vertices 时用）。不影响生成。 */
  size?: { w: number; h: number };
  /** 视图信息：90° 正交多边形顶点（相对盒子原点，闭合）。有则覆盖 size 渲染为多边形。不影响生成。 */
  vertices?: { x: number; y: number }[];
  /** 视图：本层「画线生成接口」的折线集合。不影响生成。 */
  wires?: BusWire[];
  /**
   * 视图信息：true = 作为子块出现时画成黑盒（隐藏内部嵌套预览 + 子块名标签）。
   * 缺省/false = 显示下层。仅影响渲染，不影响生成；黑盒仍可双击下钻编辑。
   */
  hideChildren?: boolean;
  /**
   * 视图信息：def 自定义颜色（#rrggbb）。盒子边框用本色、填充用其浅色版。
   * 缺省 = 默认配色（白底/青框）。仅影响渲染，不影响生成。
   */
  color?: string;
  /** DFT（SpecGen）：本 harden 内摆的 DFT IP。DFT/视图专用，generate/校验不读，不影响 genconnection。 */
  dftIps?: DftIpInstance[];
  /** DFT（SpecGen）：DFT IP 端口/接口引脚间连线。generate 不读（Slice 3）。 */
  dftWires?: DftWire[];
  /** DFT（SpecGen）：是否已「加入 SpecGen」。generate 不读。 */
  inSpecgen?: boolean;
}

/** 库 / 注册表：装所有 def（spec §2.5）。 */
export interface HardenLibrary {
  defs: HardenDef[];
}

/** 视口（纯视图，可选持久化）。 */
export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * 持久化文档 = 一份可存盘/读回的完整工程状态。
 * library 含布局字段 → 读回即可重画；ui.openDefId 决定打开哪一层。
 */
export interface GenConnDocument {
  schemaVersion: number;
  library: HardenLibrary;
  ui: {
    /** 当前打开/编辑哪个 def 的内部 */
    openDefId: Id;
    /** 设计根（决定生成时谁的文件名是 "top"） */
    rootDefId: Id;
    viewport?: Viewport;
  };
  /** DFX Ctrl 修改清单(spec §5.3;v2 起) */
  ctrlIps: DocCtrlIp[];
  /** 加入 DFX Ctrl tab 的实例 nodeId 列表(M3/D11) */
  dfxInstances: string[];
  /** D3 双计数器:模块号 / mux 号,只增不回收 */
  moduleDsNext: number;
  muxDsNext: number;
}

// ---- DFX Ctrl IP (docs/specs/2026-07-07-dfx-ctrl-ip-design.md §4.1) ----

/** ctrlgen CLI 的输入 schema,与 dft-core ctrlgen-core parseSpec 一一对应。 */
export interface CtrlPin {
  portName: string;
  mode: "control" | "observe";
  width: number;
  /** 标量/同构总线(按位展开 target[i]);与 targets 二选一 */
  target?: string;
  /** 逐位异构目标,长度 = width */
  targets?: string[];
  /** control 必填:字符串=整线;数组=按位(D8) */
  stitch?: "mux" | "replace" | "connect" | ("mux" | "replace" | "connect")[];
  /** mux 位的实例名(D3);与 stitch 同形 */
  muxName?: string | (string | null)[];
}

export interface CtrlIpSpec {
  schemaVersion: 2;
  moduleBase: string;
  /** 省略 = 终名就是 moduleBase;UI 新建总是分配 */
  dsIndex?: number;
  dfxModeSource?: string;
  gateCell?: { name: string; out: string; a: string; b: string };
  pins: CtrlPin[];
}

/** 文档内的一条 DFX 修改:CLI spec(+ 兼容旧文档的画布关联字段)。 */
export interface DocCtrlIp {
  spec: CtrlIpSpec;
  /** @deprecated M3 去画布化后不再写入;仅为读旧文档保留。目标由 spec.pins[].target 承载。 */
  ctrlInstId?: Id;
  /** @deprecated M3 去画布化后不再写入;仅为读旧文档(edit 模式反查目标)保留。目标由 spec.pins[].target 承载。 */
  targets?: Record<string, Id>;
}

import type { OpenOpts, ReadyResult } from "./model.ts";

export interface DftBridge {
  design: {
    open(opts: OpenOpts): Promise<ReadyResult>;
    close(): Promise<void>;
    query(method: string, params?: Record<string, unknown>): Promise<unknown>;
    dump(): Promise<unknown>;
    readSource(file: string): Promise<string>;
    pickFilelist(): Promise<string | null>;
    pickFolder(): Promise<string | null>;
    pickSdc(): Promise<string | null>;
  };
  genconn: {
    generateAll(docJson: string): Promise<{ files: { name: string; text: string }[]; unconnected: string[] }>;
    inject(docJson: string, vFiles: { path: string; text: string }[]): Promise<{ path: string; text: string }[]>;
  };
  ctrlgen: {
    gen(spec: unknown): Promise<{ files: { name: string; text: string }[] }>;
  };
  pad: {
    table(filelist: string, lib: string): Promise<unknown>;
    gen(filelist: string, lib: string, cfg: unknown, level: string, aux: string): Promise<string>;
    pickLib(): Promise<string | null>;
    readCfg(filelist: string): Promise<string | null>;
    writeCfg(filelist: string, json: string): Promise<string>;
    exportText(defaultName: string, text: string): Promise<string | null>;
  };
  specgen: {
    gen(docJson: string): Promise<string>;
    fragment(fragJson: string): Promise<string>;
  };
  project: {
    pickNew(): Promise<{ filelist: string; outputDir: string; projPath: string } | null>;
    pickOpen(): Promise<string | null>;
    read(path: string): Promise<string>;
    /** List a directory's entry names (DFX IP library scan). */
    listDir(path: string): Promise<string[]>;
    write(path: string, json: string): Promise<boolean>;
    writeFiles(baseDir: string, files: { relPath: string; text: string }[]): Promise<string[]>;
    recent(): Promise<string[]>;
    addRecent(path: string): Promise<string[]>;
  };
  app?: {
    /** Subscribe to the main process's "window is about to close" query. */
    onBeforeClose(handler: () => void | Promise<void>): void;
    /** Report dirty state; main returns the user's choice (or closes immediately when clean). */
    respondClose(info: { dirty: boolean }): Promise<"closed" | "save" | "discard" | "cancel">;
    /** Tell main to proceed with the close (after saving / discarding). */
    confirmClose(): Promise<void>;
    /** OK/Cancel confirmation via the main process's native message box. */
    confirm(message: string): Promise<boolean>;
    /** CLI 启动参数(--projectpath/--harden/--filelist)；无参数时各字段为 null。 */
    launchOptions(): Promise<{
      projectDir: string | null;
      filelist: string | null;
      existingProj: string | null;
      warning: string | null;
      /** DFT Studio 的 <projectpath>/dft_studio_db/<harden>/spec/logic_test —— OCC 计划
       *  (dfx_occ_def_point.tcl) 的自动写盘目录;无启动参数时为 null(不自动写)。 */
      specLogicTestDir: string | null;
      /** <projectpath>/dft_studio_db/<harden>/compiled —— gen_dft.pl 的 parse_sdc_to_yaml
       *  输出目录(clock_info_from_func_sdc.yaml / dft_clock_define.tcl / dft_clock_mapping.tcl);
       *  SDC tab 的 clockgen 移植写到这里,与流程自己跑 gen_dft.pl 产出的文件同处一地。 */
      compiledDir: string | null;
      /** harden 的 yaml/dft_cfg 目录(--dftcfg 显式传入或由 projectpath/harden 推导,
       *  目录不存在时为 null)。DFT Config 页在此编辑;打开设计时解析其中的
       *  dft_lib_setting.yaml(membistlib)/dft_user_ins_setting.yaml(dfx_ip)自动识别库。 */
      dftCfgDir: string | null;
    }>;
  };
}

declare global {
  interface Window {
    dft: DftBridge;
  }
}

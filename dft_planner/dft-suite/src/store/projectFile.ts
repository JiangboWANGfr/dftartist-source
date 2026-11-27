// .dftproj 工程文件的纯解析/序列化。工程文件是 JSON,记录设计与各文档引用。
export interface DftProject {
  version: 1;
  filelist: string;
  top: string;
  outputDir: string;
  genconnDoc: string | null;
  specgenWorkspace: string | null;
  padCfg: string | null;
  /** Scan Planner document (chain families, EDT coverage, EDT defaults). A relative path like
   *  the other documents — the plan is design-level and outlives any single controller, so it
   *  cannot live on an EDT node. */
  scanPlan: string | null;
}

export function serializeProject(p: DftProject): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(text: string): DftProject {
  const o = JSON.parse(text);
  if (typeof o?.filelist !== "string" || !o.filelist) throw new Error(".dftproj missing filelist");
  return {
    version: 1,
    filelist: o.filelist,
    top: typeof o.top === "string" ? o.top : "",
    outputDir: typeof o.outputDir === "string" ? o.outputDir : "",
    genconnDoc: typeof o.genconnDoc === "string" ? o.genconnDoc : null,
    specgenWorkspace: typeof o.specgenWorkspace === "string" ? o.specgenWorkspace : null,
    padCfg: typeof o.padCfg === "string" ? o.padCfg : null,
    // Absent in projects written before the Scan Planner existed — null, not an error.
    scanPlan: typeof o.scanPlan === "string" ? o.scanPlan : null,
  };
}

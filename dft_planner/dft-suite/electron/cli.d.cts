/** Raw JSON object returned by `hdl dump`. */
export interface HdlHierarchy {
  schemaVersion: number;
  rootInstanceIds: string[];
  instances: Record<string, unknown>;
  definitions: Record<string, unknown>;
}

/** One generated file entry. */
export interface GeneratedFile { name: string; text: string; }

/** Return value of genconnGenerateAll — matches the bridge contract. */
export interface GenerateAllResult { files: GeneratedFile[]; unconnected: string[]; }

/** One injected file entry — matches the bridge contract. */
export interface InjectedFile { path: string; text: string; }

export declare function run(bin: string, args: string[], opts?: { input?: string }): Promise<string>;
export declare function parseFileMarkers(raw: string): { name: string; text: string }[];
export declare function hdlDump(filelist: string, top?: string): Promise<HdlHierarchy>;
export declare function genconnGenerateAll(docJson: string): Promise<GenerateAllResult>;
export declare function genconnInject(docJson: string, vFiles: { path: string; text: string }[]): Promise<InjectedFile[]>;
export declare function specgenGen(docJson: string): Promise<string>;
export declare function specgenFragment(fragJson: string): Promise<string>;

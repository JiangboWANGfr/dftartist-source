export declare const USAGE: string;
export declare function parseLaunchArgs(
  argv: string[],
  cwd: string,
): { projectDir: string | null; filelist: string | null } | { error: string };

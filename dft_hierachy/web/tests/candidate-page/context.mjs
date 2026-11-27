// A regression fixture: real public models, controlled SDK methods, no Core/IPC.
import { pathToFileURL } from "node:url";

const directory = process.env.HIER_A_VIEWMODEL_DIR;
export const vm = await import(directory
  ? pathToFileURL(`${directory}/index.js`)
  : new URL("../../packages/viewmodel/dist/index.js", import.meta.url));
import { createContext } from "./scenario.mjs";
export { freeze, page, hit, span, snapshotId } from "./scenario.mjs";
export const context = (options) => createContext(vm, options);

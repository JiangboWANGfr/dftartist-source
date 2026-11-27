import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const top = "B_demo_top",
  escapedPath = "B_demo_top/\\odd.name \t";
export function fixtures() {
  const local = path.dirname(fileURLToPath(import.meta.url));
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "B73-demo 输入 ")));
  fs.mkdirSync(dir + "/rtl");
  fs.mkdirSync(dir + "/lists");
  fs.copyFileSync(local + "/design.sv", dir + "/rtl/design.sv");
  fs.copyFileSync(local + "/broken.sv", dir + "/rtl/broken.sv");
  fs.writeFileSync(dir + "/lists/design.f", "../rtl/design.sv\n");
  return {
    dir,
    source: dir + "/rtl/design.sv",
    broken: dir + "/rtl/broken.sv",
    filelist: dir + "/lists/design.f",
    top,
  };
}

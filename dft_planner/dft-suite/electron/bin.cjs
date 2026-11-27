const path = require("node:path");
function resolveBin(name) {
  const dir = process.env.DFT_CORE_BIN_DIR
    || (process.env.ELECTRON_DEV ? path.join(__dirname, "..", "..", "dft-core", "build")
                                 : path.join(process.resourcesPath, "bin"));
  return path.join(dir, name);
}
module.exports = { resolveBin };

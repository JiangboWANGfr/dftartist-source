import "./dft.d.ts";

export const dftGenconn = {
  generateAll: (docJson: string) => window.dft.genconn.generateAll(docJson),
  inject: (docJson: string, vFiles: { path: string; text: string }[]) =>
    window.dft.genconn.inject(docJson, vFiles),
};

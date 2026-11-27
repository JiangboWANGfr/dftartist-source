import "./dft.d.ts";

export const dftSpecgen = {
  /** scope doc JSON -> DftSpecification .spec text (via the specgen CLI). */
  generate: (docJson: string): Promise<string> => window.dft.specgen.gen(docJson),
  /** single IP {ipType, instanceName, config} -> `.spec` fragment text (via `specgen fragment`). */
  fragment: (ipType: string, instanceName: string, config: unknown): Promise<string> =>
    window.dft.specgen.fragment(JSON.stringify({ ipType, instanceName, config })),
};

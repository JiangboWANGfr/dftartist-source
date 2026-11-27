export const cases = [
  {
    id: "PK01",
    input:
      "native root import from installed product tarballs outside workspace",
    expected:
      "new function export and old public root meanings preserved; not a UI mount",
    basis: "DESIGN §6.18.1/6; §6.14.5",
  },
  {
    id: "PK02",
    input:
      "strict consumer of actually packed public declarations and local React types",
    expected:
      "zero positive diagnostics; six isolated negatives gated by positive/source premises",
    basis: "DESIGN §6.18.1/6",
  },
  {
    id: "PK03",
    input:
      "resolve/read/parse public candidate CSS subpath from installed tarball",
    expected:
      "real nonempty valid CSS inside consumer; no source fallback or layout claim",
    basis: "DESIGN §6.18.6",
  },
  {
    id: "PK04",
    input: "offline strict-peer install and npm tree/React real resolution",
    expected:
      "declared >=18.3.1 <19 peer semantic range, no private React and one real installation",
    basis: "DESIGN §6.14.5; §6.18.6",
  },
];
const pre =
  'import type {SourceCandidatesViewProps as Props,SourceCandidatesViewFailure as Failure,SourceCandidatesViewCommand as Command} from "@hier/views";import type {SourceNavigationModel,SelectionModel} from "@hier/viewmodel";declare const navigation:SourceNavigationModel;declare const selection:SelectionModel;declare const base:Props;\n';
export const negativeCases = [
  {
    id: "NK01",
    code: 2741,
    source:
      pre +
      'const props:Props={navigation,selection,ariaLabel:"outside",height:120};',
  },
  {
    id: "NK02",
    code: 2375,
    source: pre + "const props:Props={...base,className:undefined};",
  },
  {
    id: "NK03",
    code: 2740,
    source: pre + "const props:Props={...base,navigation:{}};",
  },
  {
    id: "NK04",
    code: 2540,
    source: pre + 'declare let failure:Failure;failure.command="confirm";',
  },
  {
    id: "NK05",
    code: 2322,
    source: pre + 'const command:Command="not-a-command";',
  },
  {
    id: "NK06",
    code: 18046,
    source: pre + "declare const failure:Failure;failure.error.message;",
  },
];

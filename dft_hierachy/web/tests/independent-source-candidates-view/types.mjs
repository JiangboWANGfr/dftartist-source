export const positive = `
import type { ReactElement } from "react";
import {SourceCandidatesView,type SourceCandidatesViewProps,type SourceCandidatesViewFailure,type SourceCandidatesViewCommand} from "@hier/views";
import {SourceNavigationModel,SelectionModel,type SourceCandidateAction} from "@hier/viewmodel";
declare const n: SourceNavigationModel, s: SelectionModel, a: SourceCandidateAction;
const f=(x:SourceCandidatesViewFailure):void=>{const e:unknown=x.error;const v:SourceCandidateAction|null=x.action;void [e,v];};
const p:SourceCandidatesViewProps={navigation:n,selection:s,ariaLabel:"B 原标签",height:240,onCommandError:f};
const element:ReactElement=SourceCandidatesView(p);
SourceCandidatesView({...p,className:""});
const commands:readonly SourceCandidatesViewCommand[]=["bindActions","confirm","loadMore","reloadCandidates","cancelCandidates"];
const ok:SourceCandidatesViewFailure={command:"confirm",action:a,error:Symbol("raw")};
void [element,commands,ok];
`;
export const negatives = [
  [
    "missing-navigation",
    "SourceCandidatesView({selection:s,ariaLabel:'B',height:1,onCommandError:f});",
  ],
  [
    "missing-selection",
    "SourceCandidatesView({navigation:n,ariaLabel:'B',height:1,onCommandError:f});",
  ],
  [
    "missing-label",
    "SourceCandidatesView({navigation:n,selection:s,height:1,onCommandError:f});",
  ],
  [
    "missing-height",
    "SourceCandidatesView({navigation:n,selection:s,ariaLabel:'B',onCommandError:f});",
  ],
  [
    "missing-callback",
    "SourceCandidatesView({navigation:n,selection:s,ariaLabel:'B',height:1});",
  ],
  ["height-string", "SourceCandidatesView({...p,height:'240'});"],
  ["label-number", "SourceCandidatesView({...p,ariaLabel:1});"],
  ["class-undefined", "SourceCandidatesView({...p,className:undefined});"],
  ["class-null", "SourceCandidatesView({...p,className:null});"],
  ["class-boxed", "SourceCandidatesView({...p,className:new String('B')});"],
  [
    "callback-undefined",
    "SourceCandidatesView({...p,onCommandError:undefined});",
  ],
  ["callback-null", "SourceCandidatesView({...p,onCommandError:null});"],
  [
    "callback-arg",
    "SourceCandidatesView({...p,onCommandError:(x:string)=>{void x;}});",
  ],
  [
    "navigation-dto",
    "SourceCandidatesView({...p,navigation:{state:n.state}});",
  ],
  [
    "selection-dto",
    "SourceCandidatesView({...p,selection:{current:s.current}});",
  ],
  [
    "navigation-undefined",
    "SourceCandidatesView({...p,navigation:undefined});",
  ],
  ["selection-undefined", "SourceCandidatesView({...p,selection:undefined});"],
  ["props-readonly", "p.height=9;"],
  ["navigation-readonly", "p.navigation=n;"],
  ["selection-readonly", "p.selection=s;"],
  ["callback-readonly", "p.onCommandError=f;"],
  [
    "command-invalid",
    "const bad:SourceCandidatesViewCommand='locate';void bad;",
  ],
  [
    "failure-command-missing",
    "const bad:SourceCandidatesViewFailure={action:null,error:0};void bad;",
  ],
  [
    "failure-action-missing",
    "const bad:SourceCandidatesViewFailure={command:'confirm',error:0};void bad;",
  ],
  [
    "failure-error-missing",
    "const bad:SourceCandidatesViewFailure={command:'confirm',action:a};void bad;",
  ],
  [
    "failure-action-invalid",
    "const bad:SourceCandidatesViewFailure={command:'confirm',action:{},error:0};void bad;",
  ],
  [
    "failure-error-unknown",
    "declare const x:SourceCandidatesViewFailure;const bad:string=x.error;void bad;",
  ],
  [
    "failure-command-readonly",
    "declare const x:SourceCandidatesViewFailure;x.command='confirm';",
  ],
  [
    "failure-action-readonly",
    "declare const x:SourceCandidatesViewFailure;x.action=null;",
  ],
  [
    "failure-error-readonly",
    "declare const x:SourceCandidatesViewFailure;x.error=1;",
  ],
];

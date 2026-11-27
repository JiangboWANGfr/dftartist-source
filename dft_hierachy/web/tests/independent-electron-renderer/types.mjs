// These are independent consumers, not copied from A's selftests.
export const positive = `
import {connectElectronTransport,type ElectronBridge,type ElectronEvent,type ElectronFailure,type ElectronConnectResult} from "@hier/client/electron/renderer";
import {HierClient,type Transport} from "@hier/client";
declare const bridge:ElectronBridge;
const pending:Promise<Transport>=connectElectronTransport(bridge);
pending.then(t=>{const sdk=new HierClient(t);const off=t.onMessage(value=>void value);off();sdk.dispose();});
const frame:ElectronEvent={version:1,sessionId:"s",kind:"frame",json:"{}"};
const done:ElectronEvent={version:1,sessionId:"s",kind:"closed"};
const failure:ElectronFailure={code:"not_ready",origin:"client",message:"B",data:{reason:"B"}};
const result:ElectronConnectResult={ok:false,error:failure};
bridge.connect(event=>{if(event.kind==="frame"){const text:string=event.json;void text;}else{const error:ElectronFailure|undefined=event.error;void error;}});
bridge.start("s");bridge.send("s","{}");bridge.close("s");bridge.release("s");
void [frame,done,result];
`;
export const negatives = [
  ["factory-missing-bridge", "connectElectronTransport();"],
  [
    "factory-launch",
    "connectElectronTransport({command:'hier',args:['serve']});",
  ],
  ["bridge-not-transport", "const wrong:Transport=bridge;"],
  ["readonly-version", "bridge.version=1;"],
  ["version-not-core", "const wrong:ElectronBridge={...bridge,version:2};"],
  ["send-parsed-frame", "bridge.send('s',{id:1});"],
  ["send-missing-id", "bridge.send('{}');"],
  ["start-numeric-id", "bridge.start(7);"],
  ["release-numeric-id", "bridge.release(7);"],
  ["connect-no-receiver", "bridge.connect();"],
  ["no-generic-ipc", "bridge.invoke('read-file','/etc/passwd');"],
  [
    "frame-needs-json",
    "const wrong:ElectronEvent={version:1,sessionId:'s',kind:'frame'};",
  ],
  [
    "frame-object-json",
    "const wrong:ElectronEvent={version:1,sessionId:'s',kind:'frame',json:{}};",
  ],
  [
    "event-core-version",
    "const wrong:ElectronEvent={version:2,sessionId:'s',kind:'closed'};",
  ],
  [
    "failure-origin",
    "const wrong:ElectronFailure={code:'not_ready',origin:'main',message:'x',data:{}};",
  ],
  ["readonly-event", "frame.sessionId='other';"],
];

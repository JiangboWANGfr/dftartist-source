export const positive = `
import { CLIENT_PROTOCOL_VERSION, HierClient, HierError, isHierError, type Transport, type Reply, type ClientOptions } from "@hier/client";
const version:2=CLIENT_PROTOCOL_VERSION;
declare const transport:Transport;
const options:ClientOptions={cacheEntries:0};
const client=new HierClient(transport,options);
const oldError=new HierError("internal","core","B old constructor",{});
const oldInstance:boolean=oldError instanceof HierError;
class External extends HierError { static is(value:unknown):string{return "B external";} }
const external:HierError=new External("not_found","core","B subclass");
const guard:(value:unknown)=>value is HierError=isHierError;
declare const input:unknown;
const flag:boolean=isHierError(input);
if(isHierError(input)){
 const code:HierError["code"]=input.code;
 const origin:"client"|"core"|"transport"=input.origin;
 const data:Readonly<Record<string,unknown>>=input.data;
 const error:HierError=input;
}
`;
export const negatives = [
  ["missing-arg", "isHierError();"],
  ["extra-arg", "isHierError(input,oldError);"],
  ["not-error-return", "const bad:HierError=isHierError(input);"],
  ["not-promise-return", "const bad:Promise<boolean>=isHierError(input);"],
  ["false-not-narrowed", "if(!isHierError(input)){input.code;}"],
  ["readonly-old-code", 'oldError.code="cancelled";'],
  ["no-model-origin", 'new HierError("internal","source","B");'],
];

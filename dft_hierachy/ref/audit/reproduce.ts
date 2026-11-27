import { findExistingSource, addTrace, newSchematic, edgeId } from "../../../dft_planner/dft-suite/src/hierarchy/core/schematic.ts";
const node = (id, direction = "out", port = "Q") => ({id, instanceName: id, designName: "unit", kind: "module", ports: [{name: port, direction, busLabel: port}]});
const existingLogic = {...node("logic:soc.u_a:/synthetic/unit.sv:10"), kind: "logic", parentId: "soc.u_a", loc:{file:"/synthetic/unit.sv",line:10}};
const foreignLogic = {kind:"logic",id:"logic:soc.u_b:/synthetic/unit.sv:10",label:"assign",file:"/synthetic/unit.sv",line:10};
const logicMatch = findExistingSource({[existingLogic.id]:existingLogic}, foreignLogic);
const existingPort = {...node("port:soc.u_a.clk", "out", "clk"), kind:"port", designName:"clk",parentId:"soc.u_a"};
const portMatch = findExistingSource({[existingPort.id]:existingPort}, {kind:"port",id:"port:soc.u_b.clk",label:"clk"});
const sink=node("soc.sink","in","D"), a=node("soc.a"), b=node("soc.b");
const edge=(from,net)=>({id:edgeId(from,"Q",sink.id,"D"),fromNode:from,fromPort:"Q",toNode:sink.id,toPort:"D",netName:net,bus:false});
let graph=newSchematic(sink);
graph={...graph,nodes:{...graph.nodes,[a.id]:a},edges:[edge(a.id,"shared")]};
const grown=addTrace(graph,sink.id,"D",[b],[edge(b.id,"shared")]);
const result={
 cross_instance_statement:{expected:"no match",actual:logicMatch,issue_reproduced:logicMatch?.nodeId===existingLogic.id},
 cross_instance_same_name_port:{expected:"no match",actual:portMatch,issue_reproduced:portMatch?.nodeId===existingPort.id},
 different_driver_discarded:{expectedDriverNodes:[a.id,b.id],actualDriverNodes:grown.edges.filter(e=>e.toNode===sink.id&&e.toPort==="D").map(e=>e.fromNode),issue_reproduced:!grown.edges.some(e=>e.fromNode===b.id)}
};
console.log(JSON.stringify(result,null,2));
if (!Object.values(result).every(r=>r.issue_reproduced)) process.exitCode=1;

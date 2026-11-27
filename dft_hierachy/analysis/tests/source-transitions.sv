module transitions_shared(input logic a,b,sel,input logic [3:0] d,output logic [3:0] q,r);
 wire chosen=sel?b:a;
 always @(posedge chosen) q<=d;
 always @(posedge chosen) r<=d;
endmodule
module transitions_multi_sources(input logic a,b,c,sel,input logic [3:0] d,output logic [3:0] q);
 wire first=sel?b:a;
 wire second=sel?c:b;
 always @(posedge first) q<=d;
 always @(posedge second) q<=d;
endmodule

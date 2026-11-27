module impact_leaf(input logic a,b,mode,input logic [3:0] d,output logic [3:0] q);
 wire chosen=mode?b:a;
 always @(posedge chosen) q<=d;
endmodule
module impact_other(input logic a,mode,input logic [1:0] d,output logic [1:0] q);
 always @(posedge a) q<=d;
endmodule
module impact_top(input logic a,b,mode,input logic [3:0] d,output wire [3:0] q,r,output wire [1:0] s);
 impact_leaf u0(a,b,mode,d,q);
 impact_leaf u1(a,b,mode,d,r);
 impact_other keep(a,mode,d[1:0],s);
endmodule

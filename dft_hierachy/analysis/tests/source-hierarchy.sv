module hierarchy_leaf(input logic a,b,mode,input logic [3:0] d,output logic [3:0] q);
 wire chosen=mode?b:a;
 always @(posedge chosen) q<=d;
endmodule
module hierarchy_block(input logic a,b,mode,input logic [3:0] d,output wire [3:0] q,r);
 if (1) begin:g
  hierarchy_leaf u0(a,b,mode,d,q);
 end
 hierarchy_leaf \unit.with.dot (a,b,mode,d,r);
endmodule
module hierarchy_root(input logic a,b,mode,input logic [3:0] d,output wire [3:0] q0,q1,r0,r1,output logic [1:0] local_q);
 hierarchy_block left(a,b,mode,d,q0,q1);
 hierarchy_block right(a,b,mode,d,r0,r1);
 always @(posedge a) local_q<=d[1:0];
endmodule

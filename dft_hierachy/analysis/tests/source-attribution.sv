module attribution_multi(input logic a,b,sel,input logic [7:0] d,output logic [7:0] q,output logic [3:0] r);
 wire chosen=sel?b:a;
 always @(posedge a) q[7:4]<=d[7:4];
 always @(posedge chosen) q[5:1]<=d[5:1];
 always @(posedge chosen) r<=d[3:0];
endmodule

module evidence_overlap(input logic a,b,c,sel,input logic [7:0] d,output logic [7:0] q);
 always @(posedge a) q[5:0]<=d[5:0];
 always @(posedge a) q[7:2]<=d[7:2];
 wire extra=sel?c:b;
 always @(posedge extra) q[4:3]<=d[4:3];
endmodule

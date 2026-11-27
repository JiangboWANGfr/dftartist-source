module deltas_holes(input logic a,b,sel,input logic [15:0] d,output logic [15:0] q);
 wire chosen=sel?b:a;
 always @(posedge a) q[2:0]<=d[2:0];
 always @(negedge a) q[12:10]<=d[12:10];
 always @(posedge chosen) q[8:2]<=d[8:2];
endmodule

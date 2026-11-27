module sources_move(input logic a,b,sel,input logic [9:0] d,output logic [9:0] q);
 wire chosen=sel?b:a;
 always @(posedge a) q[9:4]<=d[9:4];
 always @(posedge chosen) q[7:1]<=d[7:1];
endmodule
module sources_multiplicity(input logic a,b,sel,input logic [3:0] d,output logic [3:0] q);
 wire chosen=sel?b:a;
 always @(posedge a) q<=d;
 always @(posedge b) q<=d;
 always @(posedge chosen) q<=d;
endmodule
module sources_polarity(input logic a,sel,input logic [3:0] d,output logic [3:0] q);
 wire chosen=sel?~a:a;
 always @(posedge chosen) q<=d;
endmodule

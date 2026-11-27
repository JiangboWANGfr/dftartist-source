module fanout_slice(input logic c,input logic [9:0] d,output logic [9:0] q);
 always @(posedge c) q[9:4]<=d[9:4];
 always @(negedge c) q[7:1]<=d[7:1];
endmodule
module fanout_overlap(input logic clk,input logic [9:0] d,output logic [9:0] q);
 logic stage;
 always @(posedge clk) stage<=d[0];
 fanout_slice u(stage,d,q);
endmodule
module fanout_roles(input logic c,d,output logic q);
 always @(posedge c or negedge c) if(!c) q<=0;else q<=d;
endmodule

module sources_alias(input logic c,input logic [9:0] d,output logic [9:0] q);
 wire a=c,b=c;
 always @(posedge a) q[9:4]<=d[9:4];
 always @(negedge b) q[7:1]<=d[7:1];
endmodule
module sources_invert(input logic c,input logic [9:0] d,output logic [9:0] q);
 wire b=~c;
 always @(posedge c) q[9:4]<=d[9:4];
 always @(posedge b) q[7:1]<=d[7:1];
endmodule
module sources_roles(input logic c,r,input logic [9:0] d,output logic [9:0] q);
 always @(posedge c or negedge r) if(!r) q<=0;else q<=d;
endmodule
module sources_leaf #(parameter W=3)(input logic c,input logic [W-1:0] d,output logic [W-1:0] q);
 always @(posedge c) q<=d;
endmodule
module sources_instances(input logic c,input logic [7:0] d,output logic [7:0] q);
 sources_leaf #(.W(3)) x(c,d[2:0],q[2:0]);sources_leaf #(.W(5)) y(c,d[7:3],q[7:3]);
endmodule

// B49 handwritten from DESIGN7.5.9-12; no author RTL copied.
module R_empty(input wire c); endmodule
module R_leaf #(parameter W=3)(input wire c,input wire[W-1:0]d,output reg[W-1:0]q);
 always @(posedge c)q<=d;
endmodule
module R_tree(input wire c,input wire[4:0]d,output wire[2:0]a,b,output wire[4:0]z);
 R_leaf #(.W(3)) one(.c(c),.d(d[2:0]),.q(a));
 R_leaf #(.W(3)) two(.c(c),.d(d[2:0]),.q(b));
 R_leaf #(.W(5)) wide(.c(c),.d(d),.q(z));
 R_empty idle(.c(c));
endmodule
module R_ranges(input wire c0,c1,input wire[15:0]d,output reg[15:0]q);
 always @(posedge c0)q[8:3]<=d[8:3];
 always @(posedge c0)q[5:1]<=d[5:1];
 always @(posedge c1)q[14:12]<=d[14:12];
endmodule
module R_cross(input wire c0,c1,c2,input wire[8:0]d,output reg[8:0]q);
 always @(posedge c0)q[8:3]<=d[8:3];
 always @(posedge c1)q[5:1]<=d[5:1];
 always @(posedge c2)q[4:2]<=d[4:2];
endmodule
module R_alias(input wire c,r,input wire[11:0]d,output reg[11:0]q);
 wire ac=c, ar=r;
 always @(posedge c or negedge r) if(!r)q[6:2]<=0;else q[6:2]<=d[6:2];
 always @(posedge ac or negedge ar) if(!ar)q[9:5]<=0;else q[9:5]<=d[9:5];
endmodule
module R_diffreset(input wire c,r0,r1,input wire[11:0]d,output reg[11:0]q);
 always @(posedge c or negedge r0)if(!r0)q[6:2]<=0;else q[6:2]<=d[6:2];
 always @(posedge c or negedge r1)if(!r1)q[9:5]<=0;else q[9:5]<=d[9:5];
endmodule
module R_roles(input wire c,r,input wire[11:0]d,output reg[11:0]q);
 always @(posedge c or negedge r)if(!r)q[6:2]<=0;else q[6:2]<=d[6:2];
 always @(posedge c or negedge r)if(!r)q[9:5]<='1;else q[9:5]<=d[9:5];
endmodule
module R_order(input wire c,a,b,d,output reg q0,q1);
 always @(posedge c or negedge a or negedge b)if(!a)q0<=0;else if(!b)q0<=0;else q0<=d;
 always @(posedge c or negedge b or negedge a)if(!a)q1<=0;else if(!b)q1<=0;else q1<=d;
endmodule
module R_edges(input wire c,input wire[7:0]d,output reg[7:0]q);
 wire inv=~c;
 always @(posedge c)q[1:0]<=d[1:0]; always @(negedge c)q[3:2]<=d[3:2];
 always @(posedge inv)q[5:4]<=d[5:4]; always @(negedge inv)q[7:6]<=d[7:6];
endmodule
module R_mode(input wire r0,r1,sel,d,output reg q);
 wire c=sel ? r1 : r0; always @(posedge c)q<=d;
endmodule
module R_async_unknown(input wire c,a,b,d,output reg q);
 wire r=c ^ a ^ b; always @(posedge c or negedge r)if(!r)q<=0;else q<=d;
endmodule
module R_gate(input wire c,en,d,output reg q);
 wire g=c & en; always @(posedge g)q<=d;
endmodule
module R_const(input wire d,output reg q);
 wire c=1'bx; always @(posedge c)q<=d;
endmodule
module R_float(input wire d,output reg q);
 wire c;always @(posedge c)q<=d;
endmodule
module R_generated(input wire c,d,output wire q);
 reg g;always @(posedge c)g<=~g;
 R_leaf #(.W(1)) u(.c(g),.d(d),.q(q));
endmodule
module R_blackbox(input wire c,d,output reg q);
 wire missing;R_absent box(.c(missing));always @(posedge c)q<=d;
endmodule
module R_pages(input wire c,input wire[206:0]d,output reg[206:0]q);
 for(genvar i=0;i<207;i=i+1)begin:cells always @(posedge c)q[i]<=d[i];end
endmodule

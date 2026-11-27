// Agent B handwritten RTL; DESIGN 7.5.6-8 only. No author fixture imported.
module H_leaf(input wire c,d, output reg q);
  always @(posedge c) q <= d;
endmodule
module H_empty(input wire unused, output wire q); assign q=unused; endmodule
module H_events(input wire c,d, output reg a,b, output reg n);
  always @(posedge c) a<=d;
  always @(posedge c or negedge c) if(!c) b<=0; else b<=d;
  wire inv=~c;
  always @(posedge inv) n<=d;
endmodule
module H_consts(input wire d, output reg a,b,z);
  wire zero=1'b0, one=1'b1;
  always @(posedge zero) a<=d;
  always @(posedge zero) b<=d;
  always @(posedge one) z<=d;
endmodule
module H_chain(input wire root,d, output wire q);
  reg a,b;
  always @(posedge root) a<=~a;
  always @(posedge a) b<=~b;
  H_leaf u(.c(b),.d(d),.q(q));
endmodule
module H_pair(input wire [1:0] c,input wire d,output reg [1:0] q);
  always @(posedge c[0]) q[0]<=d;
  always @(posedge c[1]) q[1]<=d;
endmodule
module H_bits(input wire [1:0] roots,input wire d,output wire [1:0] q);
  reg [1:0] x;
  always @(posedge roots[0]) x[0]<=~x[0];
  always @(posedge roots[1]) x[1]<=~x[1];
  H_pair u(.c(x),.d(d),.q(q));
endmodule
module H_twins(input wire c0,c1,d,output wire q0,q1);
  H_leaf left(.c(c0),.d(d),.q(q0)); H_leaf right(.c(c1),.d(d),.q(q1));
endmodule
module H_cycle(input wire d,output wire q);
  reg a,b;
  always @(posedge b) a<=~a;
  always @(posedge a) b<=~b;
  H_leaf u(.c(a),.d(d),.q(q));
endmodule
module H_modes(input wire r0,r1,sel,d,output wire q);
  wire start=sel ? r1 : r0;
  reg a,b;
  always @(posedge start) a<=~a;
  always @(posedge a) b<=~b;
  H_leaf u(.c(b),.d(d),.q(q));
endmodule
module H_async(input wire root,r0,r1,sel,d,output wire q);
  wire reset=sel ? r1 : r0;
  reg a;
  always @(posedge root or negedge reset) if(!reset) a<=0; else a<=~a;
  H_leaf u(.c(a),.d(d),.q(q));
endmodule
module H_polarity(input wire root,sel,d,output wire q);
  wire c=sel ? ~root : root;
  reg a; always @(posedge c) a<=~a;
  H_leaf u(.c(a),.d(d),.q(q));
endmodule
module H_mixed(input wire root,x,y,unused,d,output wire q0,q1);
  wire unknown=root ^ x ^ y;
  H_leaf left(.c(root),.d(d),.q(q0)); H_leaf right(.c(unknown),.d(d),.q(q1));
endmodule
module H_gate(input wire root,en,d,output wire q);
  wire c=root & en; H_leaf u(.c(c),.d(d),.q(q));
endmodule

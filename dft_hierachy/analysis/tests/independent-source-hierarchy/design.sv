// Reuse original B50 handwritten T modules verbatim; old fixture unchanged.
// B50: independent RTL from DESIGN7.5.13-15, no author fixture imported.
module T_overlap(input wire c0,c1,input wire[11:0]d,output reg[11:0]q);
 always @(posedge c0)q[9:4]<=d[9:4];
 always @(posedge c1)q[7:1]<=d[7:1];
endmodule
module T_sink(input wire c,r,input wire[5:0]d,output reg[5:0]q);
 always @(posedge c or negedge r)if(!r)q<=0;else q<=d;
endmodule
module T_two(input wire c0,c1,d,output reg q0,q1);
 always @(posedge c0)q0<=d;always @(posedge c1)q1<=d;
endmodule
module T_direct(input wire a,b,c,e,mode,input wire[11:0]d,output wire[11:0]q);
 wire c0=mode ? b : a, c1=mode ? e : c;
 T_overlap u(.c0(c0),.c1(c1),.d(d),.q(q));
endmodule
module T_swap(input wire a,b,mode,d,output wire q0,q1);
 wire c0=mode ? b : a, c1=mode ? a : b;
 T_two u(.c0(c0),.c1(c1),.d(d),.q0(q0),.q1(q1));
endmodule
module T_merge(input wire a,b,mode,d,output wire q0,q1);
 wire c0=mode ? a : b;T_two u(.c0(c0),.c1(a),.d(d),.q0(q0),.q1(q1));
endmodule
module T_async(input wire c,a,b,mode,input wire[5:0]d,output wire[5:0]q);
 wire r=mode ? b : a;T_sink u(.c(c),.r(r),.d(d),.q(q));
endmodule
module T_polarity(input wire c,mode,input wire[5:0]d,output reg[5:0]q);
 wire gated=mode ? ~c : c;always @(posedge gated)q<=d;
endmodule
module T_partial(input wire a,b,x,y,mode,input wire[5:0]d,output reg[5:0]q0,q1);
 wire good=mode ? b : a, bad=a ^ x ^ y;
 always @(posedge good)q0<=d;always @(posedge bad)q1<=d;
endmodule
module T_network(input wire r0,r1,mode,input wire[5:0]d,output wire[5:0]q);
 reg a,b,rr;
 always @(posedge r0)a<=~a;always @(posedge a)b<=~b;
 always @(posedge r1)rr<=~rr;
 T_sink u(.c(b),.r(rr),.d(d),.q(q));
endmodule
module T_fanout(input wire c,d,output wire q0,q1);
 reg g;always @(posedge c)g<=~g;wire aliasg=g;
 T_two u(.c0(g),.c1(aliasg),.d(d),.q0(q0),.q1(q1));
endmodule
module T_bits(input wire c0,c1,d,output wire q0,q1);
 reg[1:0]g;always @(posedge c0)g[0]<=~g[0];always @(posedge c1)g[1]<=~g[1];
 T_two u(.c0(g[0]),.c1(g[1]),.d(d),.q0(q0),.q1(q1));
endmodule
module T_cycle(input wire r,mode,input wire[5:0]d,output wire[5:0]q);
 reg a,b;always @(posedge b)a<=~a;always @(posedge a)b<=~b;
 T_sink u(.c(a),.r(r),.d(d),.q(q));
endmodule
module T_deep(input wire a,b,c,e,mode,input wire[11:0]d,output wire[11:0]q);
 wire c0=mode ? b : a,c1=mode ? e : c;reg g0,g1;
 always @(posedge c0)g0<=~g0;always @(posedge c1)g1<=~g1;
 T_overlap u(.c0(g0),.c1(g1),.d(d),.q(q));
endmodule
module T_deep_async(input wire c,a,b,r,mode,input wire[5:0]d,output wire[5:0]q);
 wire reset=mode ? b : a;reg g;
 always @(posedge c or negedge reset)if(!reset)g<=0;else g<=~g;
 T_sink u(.c(g),.r(r),.d(d),.q(q));
endmodule
module T_deep_polarity(input wire c,r,mode,input wire[5:0]d,output wire[5:0]q);
 wire clock=mode ? ~c : c;reg g;always @(posedge clock)g<=~g;
 T_sink u(.c(g),.r(r),.d(d),.q(q));
endmodule
module T_pages(input wire a,b,mode,input wire[210:0]d,output reg[210:0]q);
 wire c=mode ? b : a;for(genvar i=0;i<211;i=i+1)begin:cells always @(posedge c)q[i]<=d[i];end
endmodule
module T_empty(input wire mode);endmodule
// New B51 inputs; all expected behavior comes from DESIGN7.5.16-18.
module U_shared(input wire a,input wire[11:0]d,output wire[11:0]q);
 reg g0,g1;always @(posedge a)g0<=~g0;always @(posedge a)g1<=~g1;
 T_overlap u(.c0(g0),.c1(g1),.d(d),.q(q));
endmodule
module U_alias(input wire a,input wire[11:0]d,output wire[11:0]q);
 wire aa=a;T_overlap u(.c0(a),.c1(aa),.d(d),.q(q));
endmodule
module U_roles(input wire a,input wire[5:0]d,output wire[5:0]q);
 reg g;always @(posedge a)g<=~g;T_sink u(.c(g),.r(g),.d(d),.q(q));
endmodule
module U_polarity(input wire a,input wire[11:0]d,output wire[11:0]q);
 wire inv=~a;T_overlap u(.c0(a),.c1(inv),.d(d),.q(q));
endmodule
module U_clockreset(input wire a,b,input wire[5:0]d,output wire[5:0]q);
 T_sink u(.c(a),.r(b),.d(d),.q(q));
endmodule
module U_const(input wire[11:0]d,output wire[11:0]q);
 wire c0=1'bx,c1=1'bx;T_overlap u(.c0(c0),.c1(c1),.d(d),.q(q));
endmodule
module U_float(input wire[11:0]d,output wire[11:0]q);
 wire c0,c1;T_overlap u(.c0(c0),.c1(c1),.d(d),.q(q));
endmodule
module U_rewire(input wire a,mode,input wire[11:0]d,output wire[11:0]q);
 reg g0,g1;always @(posedge a)g0<=~g0;always @(posedge a)g1<=~g1;
 wire c0=mode ? g1 : g0,c1=mode ? g0 : g1;
 T_overlap u(.c0(c0),.c1(c1),.d(d),.q(q));
endmodule
module U_multiplicity(input wire a,b,mode,input wire[11:0]d,output reg[11:0]q);
 wire c=mode ? b : a;
 always @(posedge a)q[9:1]<=d[9:1];always @(posedge c)q[7:4]<=d[7:4];
endmodule

// B52 handwritten fixtures, independent of author implementation/tests.
module V_swap(input a,b,mode,input [9:1] d,output [9:1] q);
wire c0=mode?b:a; wire c1=mode?a:b; T_overlap u(c0,c1,d,q);
endmodule
module V_sets(input a,b,c,mode,input [9:4] d,input [13:12] e,output reg [9:4] q,output reg [13:12] s);
wire x=mode?c:a;
always @(posedge x) q<=d; always @(posedge b) q<=d;
always @(posedge x) s<=e; always @(posedge b) s<=e;
endmodule
module V_holes(input a,b,mode,input [9:1] d,output reg [9:1] q);
wire x=mode?b:a; always @(posedge x) begin q[3:1]<=d[3:1];q[9:7]<=d[9:7];end
endmodule

// B53 independent handwritten true-instance tree. Generate is not an instance.
module W_leaf(input c,input[3:0]d,output reg[3:0]y);always @(posedge c)y<=d;endmodule
module W_wrap(input c,input[3:0]d,output[7:0]y);W_leaf p(c,d,y[3:0]);W_leaf q(c,d,y[7:4]);endmodule
module W_tree(input a,b,mode,input[3:0]d,output[17:0]y);
wire c=mode?b:a;reg[1:0]keep;always @(posedge a)keep<=d[1:0];assign y[17:16]=keep;
W_wrap grp(c,d,y[7:0]);W_leaf \edge.case (c,d,y[11:8]);
generate if(1)begin:zone W_leaf tail(c,d,y[15:12]);end endgenerate
endmodule

module clock_top(input logic c,k,en,d,output logic [1:0] qa,output wire [1:0] alias_a,
                 output logic qb,qc,qd,qg,qs,qu);
 wire inverted=~c;wire gated=c&en;wire stuck=1'b0;wire floating_clock;
 always_ff @(posedge c) qa<={2{d}};
 always_ff @(negedge c) qb<=d;
 always_ff @(posedge inverted) qc<=d;
 always_ff @(posedge k) qd<=d;
 always_ff @(posedge gated) qg<=d;
 always_ff @(posedge stuck) qs<=d;
 always_ff @(posedge floating_clock) qu<=d;
 assign alias_a=qa;
endmodule
module clock_leaf(input logic clk,d,output logic q);
 always_ff @(negedge clk)q<=d;
endmodule
module clock_hierarchy(input logic c,d,output wire q);
 wire n=~c;clock_leaf u(.clk(n),.d(d),.q(q));
endmodule
module clock_split(input logic c,k,d,output logic [3:0] q);
 always_ff @(posedge c)q[1:0]<={2{d}};
 always_ff @(posedge k)q[3:2]<={2{d}};
endmodule
module clock_overlap(input logic c,k,d,output logic q);
 always @(posedge c)q<=d;
 always @(posedge k)q<=d;
endmodule

module boundary_leaf(input logic c, r, en, input logic [3:0] d, output logic [3:0] q);
  always_ff @(posedge c or negedge r) if (!r) q <= 0; else if (en) q <= d;
endmodule
module boundary_top(input logic c, r, en, input logic [3:0] d,
  input logic unused, pass, output wire through, output logic [3:0] q,
  output wire one, out_unknown, output wire [3:0] other);
  boundary_leaf u(c,r,en,{d[0],d[1],d[2],d[3]},q);
  boundary_leaf v(c,r,en,d,other);
  assign through = pass;
  assign one = 1'b1;
  MISSING unknown_cell(.Y(out_unknown));
endmodule
module boundary_diamond(input logic d,c, output logic q);
  wire a=d, b=d, x=a^b;
  always_ff @(posedge c) q<=x;
endmodule
module boundary_cycle(input wire a, output wire y);
  wire x;
  assign x = y | a;
  assign y = x;
endmodule
module boundary_inout(inout wire [1:0] p);
endmodule
module boundary_flat(input logic c,r,en,input logic [3:0] d,output logic [3:0] q);
  always_ff @(posedge c or negedge r) if (!r) q<=0;else if(en) q<=d;
endmodule
module boundary_pass(input wire a,output wire y);
  assign y=a;
endmodule
module boundary_shell(input logic c,output wire q);
  wire p;
  boundary_pass u(1'b1,p);
  logic state;
  always_ff @(posedge c) state<=p;
  assign q=state;
endmodule
module boundary_mixed(input logic c,d,output logic q,output wire y);
  always_ff @(posedge c) q<=d;
  assign y=d;
endmodule
module boundary_opaque(input wire d,output wire y);
  MISSING u(.A(d),.Y(y));
endmodule

// B73 hand-written composition input; behavioral facts come from this HDL.
module B_demo_leaf #(parameter W = 2) (input logic [W-1:0] a, output logic [W-1:0] y);
  wire [W-1:0] sum;
  assign sum = a;
  assign y = sum;
endmodule

module B_demo_top(input logic [1:0] i, output logic [1:0] o);
  logic [1:0] mid;
  B_demo_leaf u0(.a(i), .y(mid));
  B_demo_leaf u1(.a(mid), .y(o));
  wire \odd.name ;
  assign \odd.name  = i[0];
endmodule

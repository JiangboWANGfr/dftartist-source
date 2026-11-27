// Agent B: R1 step inputs; maps and counts are computed from these declarations.
module b_step_leaf(input wire [3:0] d, output wire [3:0] y);
  assign y = d;
endmodule
module b_step_shared(input wire [3:0] a, output wire [15:0] y);
  b_step_leaf n0(.d(a), .y(y[3:0]));
  b_step_leaf n1(.d(a), .y(y[7:4]));
  b_step_leaf n2(.d(a), .y(y[11:8]));
  b_step_leaf n3(.d(a), .y(y[15:12]));
endmodule
module b_step_map(input wire [3:0] a, output wire [3:0] y);
  b_step_leaf u(.d({a[0], a[1], a[0], 1'bz}), .y(y));
endmodule
module b_step_const(output wire [3:0] y);
  b_step_leaf u(.d(4'b10xz), .y(y));
endmodule
module b_step_multi(input wire [3:0] a, b, output wire [3:0] y);
  assign y = a;
  assign y = b;
endmodule
module b_step_reg(input wire clk, input wire [3:0] d, output logic [3:0] q);
  always_ff @(posedge clk) q[1:0] <= d[1:0];
  always_comb q[3:2] = d[3:2];
endmodule

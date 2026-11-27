// B independent M4 SDK/Core KAT; two equal-value leaf occurrences.
module b_m4_leaf #(parameter int W = 4)
  (input logic [W-1:0] a, output logic [W-1:0] y);
  assign y = a;
endmodule
module b_m4_top(input logic clk, input logic rst_n, input logic [3:0] d,
                output logic [3:0] y, output logic [3:0] q);
  logic [3:0] mid;
  logic [3:0] alpha;
  logic [3:0] Alpha;
  logic [3:0] alpha_tail;
  b_m4_leaf #(.W(4)) u(.a(d), .y(mid));
  b_m4_leaf v(.a(d), .y());
  assign alpha = d;
  assign Alpha = alpha;
  assign alpha_tail = d;
  assign y = mid;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 4'b0000;
    else q <= d;
endmodule

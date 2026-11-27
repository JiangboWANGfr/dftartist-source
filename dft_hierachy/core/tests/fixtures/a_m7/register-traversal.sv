module traversal_leaf(input logic clk, reset_n, d, output logic q);
  always_ff @(posedge clk or negedge reset_n)
    if (!reset_n) q <= 1'b0; else q <= d;
endmodule
module traversal_branch(input logic clk, reset_n, d, output logic [1:0] q);
  traversal_leaf left(.clk(clk), .reset_n(reset_n), .d(d), .q(q[0]));
  traversal_leaf right(.clk(clk), .reset_n(reset_n), .d(d), .q(q[1]));
  mystery opaque(.PIN(d));
endmodule
module traversal_top(input logic clk, reset_n, d, output logic [4:0] q);
  traversal_branch first(.clk(clk), .reset_n(reset_n), .d(d), .q(q[1:0]));
  traversal_leaf middle(.clk(clk), .reset_n(reset_n), .d(d), .q(q[2]));
  traversal_branch last(.clk(clk), .reset_n(reset_n), .d(d), .q(q[4:3]));
endmodule

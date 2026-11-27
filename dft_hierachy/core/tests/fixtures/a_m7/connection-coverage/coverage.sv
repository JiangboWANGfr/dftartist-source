module coverage_leaf(input wire [31:0] a, input wire clk, rst_n,
                     output wire [31:0] y, output logic [31:0] q);
  assign y[7:0] = a[7:0];
  assign y[15:8] = a[7:0];
  assign y[23:16] = a[31:24];
  assign y[31:24] = 8'ha5;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= '0;
    else q <= y;
endmodule
module coverage_top(input wire [31:0] a, input wire clk, rst_n,
                    output wire [31:0] y, q);
  wire [31:0] other_y, other_q;
  coverage_leaf left(.a(a), .clk(clk), .rst_n(rst_n), .y(y), .q(q));
  coverage_leaf right(.a(a), .clk(clk), .rst_n(rst_n), .y(other_y), .q(other_q));
endmodule

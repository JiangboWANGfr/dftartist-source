// Independent fallback oracle: one sequential process has two real targets.
// Body accesses read a, b, rst_n; events additionally use clk/rst_n.
module fallback_events(input logic clk, rst_n, a, b, output logic y, z);
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      y <= 1'b0;
      z <= 1'b0;
    end else begin
      y <= a;
      z <= b;
    end
  end
endmodule

// Fixture for the `clockstat` statistic: one of each way to write logic on a clock or
// async-reset path. Expected counts are in the comment on each construct.
module ff(input logic clk, input logic rst_n, input logic d, output logic q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 1'b0;
    else        q <= d;
endmodule

module top(input logic clk_a, input logic clk_b, input logic sel, input logic en,
           input logic rst_n, input logic test_mode, input logic d, output logic [4:0] q);
  logic clk_mux_assign, clk_mux_proc, clk_mux_case, clk_gated, clk_inv, clk_div, rst_mux;

  assign clk_mux_assign = sel ? clk_a : clk_b;        // assign: selector (?:)

  always_comb begin                                    // procedural block WITH if/case
    if (sel) clk_mux_proc = clk_a;
    else     clk_mux_proc = clk_b;
  end

  always @* begin                                      // procedural block WITH if/case
    case (sel)
      1'b0:    clk_mux_case = clk_a;
      default: clk_mux_case = clk_b;
    endcase
  end

  assign clk_gated = clk_a & en;                       // assign: gate (binary op)
  assign clk_inv   = ~clk_gated;                       // assign: inverter / unary

  always_ff @(posedge clk_a) clk_div <= ~clk_div;      // register output used as clock

  assign rst_mux = test_mode ? rst_n : (rst_n & en);   // assign: selector (?:), reset path

  logic unrelated;                                     // NOT on a clock path: not counted
  always_comb begin
    if (sel) unrelated = d;
    else     unrelated = ~d;
  end

  ff u0(.clk(clk_mux_assign), .rst_n(rst_mux), .d(unrelated), .q(q[0]));
  ff u1(.clk(clk_mux_proc),   .rst_n,          .d,            .q(q[1]));
  ff u2(.clk(clk_mux_case),   .rst_n,          .d,            .q(q[2]));
  ff u3(.clk(clk_inv),        .rst_n,          .d,            .q(q[3]));
  ff u4(.clk(clk_div),        .rst_n,          .d,            .q(q[4]));
endmodule

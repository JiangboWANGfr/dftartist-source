module leaf #(parameter int W = 8, parameter int SEED = 0)
  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);
  logic [W-1:0] t;
  assign t = {d[W/2-1:0], d[W-1:W/2]} ^ W'(SEED);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= '0;
    else        q <= t + d;
endmodule

module node4 #(parameter int W = 8, parameter int BASE = 0)
  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);
  logic [W-1:0] c [10];
  for (genvar i = 0; i < 10; i++) begin : g
    leaf #(.W(W), .SEED(((BASE + i) < 0 ? BASE + i + 1 : 0))) u (.clk, .rst_n, .d(d ^ W'(i)), .q(c[i]));
  end
  always_comb begin
    q = '0;
    for (int i = 0; i < 10; i++) q ^= c[i];
  end
endmodule

module node3 #(parameter int W = 8, parameter int BASE = 0)
  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);
  logic [W-1:0] c [10];
  for (genvar i = 0; i < 10; i++) begin : g
    node4 #(.W(W), .BASE(((BASE + i * 10) < 0 ? BASE + i * 10 : 0))) u (.clk, .rst_n, .d(d ^ W'(i)), .q(c[i]));
  end
  always_comb begin
    q = '0;
    for (int i = 0; i < 10; i++) q ^= c[i];
  end
endmodule

module node2 #(parameter int W = 8, parameter int BASE = 0)
  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);
  logic [W-1:0] c [10];
  for (genvar i = 0; i < 10; i++) begin : g
    node3 #(.W(W), .BASE(((BASE + i * 100) < 0 ? BASE + i * 100 : 0))) u (.clk, .rst_n, .d(d ^ W'(i)), .q(c[i]));
  end
  always_comb begin
    q = '0;
    for (int i = 0; i < 10; i++) q ^= c[i];
  end
endmodule

module node1 #(parameter int W = 8, parameter int BASE = 0)
  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);
  logic [W-1:0] c [10];
  for (genvar i = 0; i < 10; i++) begin : g
    node2 #(.W(W), .BASE(((BASE + i * 1000) < 0 ? BASE + i * 1000 : 0))) u (.clk, .rst_n, .d(d ^ W'(i)), .q(c[i]));
  end
  always_comb begin
    q = '0;
    for (int i = 0; i < 10; i++) q ^= c[i];
  end
endmodule

module node0 #(parameter int W = 8, parameter int BASE = 0)
  (input logic clk, input logic rst_n, input logic [W-1:0] d, output logic [W-1:0] q);
  logic [W-1:0] c [10];
  for (genvar i = 0; i < 10; i++) begin : g
    node1 #(.W(W), .BASE(((BASE + i * 10000) < 0 ? BASE + i * 10000 : 0))) u (.clk, .rst_n, .d(d ^ W'(i)), .q(c[i]));
  end
  always_comb begin
    q = '0;
    for (int i = 0; i < 10; i++) q ^= c[i];
  end
endmodule

module top(input logic clk, input logic rst_n, input logic [7:0] d, output logic [7:0] q);
  node0 #(.W(8), .BASE(0)) u (.clk, .rst_n, .d, .q);
endmodule

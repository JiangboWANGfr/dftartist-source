// DRC fixtures: each top exercises one clock/reset controllability case.
// Leaf flop brings clock + async reset in via ports.
module ff(input clk, input rst_n, input d, output reg q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 1'b0;
    else        q <= d;
endmodule

// CLEAN: clk + rst_n threaded straight from this top's primary inputs.
module clean_top(input clk, input rst_n, input d, output q);
  ff u_ff(.clk(clk), .rst_n(rst_n), .d(d), .q(q));
endmodule

// CLK-UNCTRL: clock pin driven by an internal net that nothing drives.
module clk_unctrl_top(input rst_n, input d, output q);
  wire clk_dead;  // never driven, never a port
  ff u_ff(.clk(clk_dead), .rst_n(rst_n), .d(d), .q(q));
endmodule

// RST-UNCTRL: async reset pin driven by an undriven internal net.
module rst_unctrl_top(input clk, input d, output q);
  wire rst_dead;  // never driven
  ff u_ff(.clk(clk), .rst_n(rst_dead), .d(d), .q(q));
endmodule

// CLEAN through two hierarchy levels (recursion across port boundaries).
module mid(input clk, input rst_n, input d, output q);
  ff u_ff(.clk(clk), .rst_n(rst_n), .d(d), .q(q));
endmodule
module deep_top(input clk, input rst_n, input d, output q);
  mid u_mid(.clk(clk), .rst_n(rst_n), .d(d), .q(q));
endmodule

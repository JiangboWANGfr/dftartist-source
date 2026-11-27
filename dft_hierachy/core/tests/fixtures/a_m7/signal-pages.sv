module signal_leaf(input logic [3:0] a, output wire [3:0] y);
  wire [3:0] match_first = a;
  logic signed [7:4] Match_upper;
  wire [0:3] match_last = match_first;
  wire \match.dot = a[0];
  for (genvar n = -1; n < 2; ++n) begin : g
    wire match_scoped = a[0];
  end
  assign y = match_last;
endmodule
module signal_top(input logic [3:0] a, output wire [3:0] y);
  signal_leaf one(.a, .y);
  signal_leaf two(.a, .y());
  missing_signal_cell bb(.A(a));
endmodule

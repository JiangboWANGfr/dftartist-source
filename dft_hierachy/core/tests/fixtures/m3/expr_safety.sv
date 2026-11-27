// Agent B: independent value-map safety inputs, never copied from A's tests.
module stream_left(input wire [7:0] a, output wire [7:0] y);
  assign {<<{y}} = a;
endmodule

module stream_chunks(output wire [1:0] hi, lo);
  assign {<<2{hi, lo}} = 4'b1100;
endmodule

module stream_right(input wire [7:0] a, output wire [7:0] y);
  assign y = {<<{a}};
endmodule

module signed_result(input wire signed [2:0] a, output wire signed [5:0] y);
  assign y = a;
endmodule

module map_leaf(input wire [3:0] d, output wire [1:0] q);
  assign q = d[1:0];
endmodule
module map_context(input wire [3:0] a, output wire [5:0] y);
  wire initialized = a[3];
  map_leaf u(.d(~{a[1:0], a[3:2]}), .q(y));
endmodule

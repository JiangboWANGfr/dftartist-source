`include "source_include.svh"
module source_top(input wire d, output wire q);
  wire left_value, right_value;
  source_leaf left(.d(d), .q(left_value)), right(.d(d), .q(right_value));
  assign q = left_value ^ right_value;
endmodule

`include "00-leaf.svh"
`include "10-wrapper.svh"
`include "15-empty.svh"
module source_top(input wire a, output wire [3:0] y);
  source_wrapper one(.a(a), .y(y));
  source_wrapper two(.a(a), .y());
endmodule

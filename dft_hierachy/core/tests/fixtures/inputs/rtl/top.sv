// Fixture for verification item V7: every file the compile reads must be listed.
`include "defs.svh"
module top(input logic [`WIDTH-1:0] a, output logic [`WIDTH-1:0] y);
  lib_cell u(.a(a[0]), .y(y[0]));      // found through -y, not in the filelist
  assign y[`WIDTH-1:1] = a[`WIDTH-1:1];
endmodule

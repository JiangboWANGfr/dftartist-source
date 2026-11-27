`include "source_increment.svh"
`include "./source_increment.svh"
module r3_top(input wire a, input wire b, output wire q);
  wire command_value = `B_R3_CMD;
  wire [11:0] values;
  r3_leaf u[0:11](a, b, values);
  assign q = values[0];
endmodule

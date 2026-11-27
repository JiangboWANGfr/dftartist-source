module inventory_shared(input logic clk, rst, d, output logic [2:0] q);
  wire buffered, inverted;
  assign buffered = clk;
  assign inverted = ~clk;
  cell_ff a(clk,rst,d,q[0]);
  cell_ff b(buffered,rst,d,q[1]);
  cell_ff c(inverted,rst,d,q[2]);
endmodule
module inventory_ties(input logic d, output logic [1:0] q);
  cell_ff a(1'b0,1'b0,d,q[0]);
  cell_ff b(1'b0,1'b0,d,q[1]);
endmodule

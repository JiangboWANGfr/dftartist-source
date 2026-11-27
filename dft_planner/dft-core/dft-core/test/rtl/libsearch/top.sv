// -y / +libext+ fixture. `cell_and2` and `mem_1k` are NOT in this file and NOT in the filelist:
// they only exist under the search directories, so the design elaborates cleanly only when the
// library search works. cell_and2 itself instantiates cell_inv -> resolution must be recursive.
module top(input logic clk, input logic a, input logic b, output logic q, output logic [7:0] rd);
  logic hit, any;

  cell_and2 u_and (.a(a), .b(b), .z(hit));
  cell_or2  u_or  (.a(a), .b(b), .z(any));   // declared in a `-v` library file
  mem_1k u_mem (.clk(clk), .en(hit), .rd(rd));

  always_ff @(posedge clk) q <= hit & any;
endmodule

// A host integration input; not an independent B oracle.
module demo_graph_top(input logic [3:0] a, output wire [3:0] y);
  wire [3:0] mid;
  assign mid = a;
  assign y = mid;
endmodule

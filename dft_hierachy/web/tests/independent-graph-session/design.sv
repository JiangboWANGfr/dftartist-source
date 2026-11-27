module B_graph_leaf(input wire [3:0] a, output wire [3:0] y);
  wire [3:0] n;
  assign n = a;
  assign n = a;
  assign y = n;
endmodule
module B_graph_top(input wire [3:0] a, output wire [3:0] y, z);
  B_graph_leaf u(.a(a), .y(y));
  assign z = a;
endmodule

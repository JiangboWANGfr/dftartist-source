module edge_leaf(input wire a, output wire q);
  assign q = a;
endmodule
module edge_unused;
endmodule
module edge_a(input wire a, output wire q);
  edge_leaf grid[1:0][-1:-2](.a(a), .q());
  edge_leaf \grid[1][-1] (.a(a), .q());
  edge_leaf \odd.name [1:0][-1:-2](.a(a), .q());
  edge_leaf b_x(.a(a), .q());
  edge_leaf b_xy(.a(a), .q());
  absent_edge bb0(.A(a));
  absent_edge bb1(.A(a));
  buf gate0(q, a);
  buf gate1(q, a);
endmodule
module edge_b(input wire a, output wire q);
  edge_leaf b_x(.a(a), .q());
  absent_edge bb2(.A(a));
  buf gate2(q, a);
endmodule

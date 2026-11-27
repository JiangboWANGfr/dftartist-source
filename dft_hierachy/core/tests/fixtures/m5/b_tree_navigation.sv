// Agent B independent M5 Tree source KAT; not copied from A tests.
module b_tree_leaf(input logic d, output logic y);
  assign y = d;
endmodule
module b_tree_mid;
  b_tree_leaf child(.d(1'b0), .y());
endmodule
module b_tree_top;
  for (genvar j = 0; j < 3; j++) begin : g
    b_tree_mid left();
    b_tree_leaf right(.d(1'b0), .y());
  end
  b_tree_leaf \a.b (.d(1'b0), .y());
  b_tree_mid lanes[1:0]();
  b_tree_leaf plain(.d(1'b0), .y());
endmodule
module b_tree_other;
  b_tree_leaf leaf(.d(1'b0), .y());
endmodule

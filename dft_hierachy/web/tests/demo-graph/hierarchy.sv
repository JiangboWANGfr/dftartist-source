// A host integration input; not an independent B oracle.
module demo_fold_leaf(input wire [3:0] a, output wire [3:0] y);
  assign y[1:0] = a[1:0];
  assign y[3:2] = a[3:2];
endmodule

module demo_fold_top(input wire [3:0] a, output wire [3:0] y);
  wire [3:0] mid;
  demo_fold_leaf first(.a(a), .y(mid));
  demo_fold_leaf second(.a(mid), .y(y));
endmodule

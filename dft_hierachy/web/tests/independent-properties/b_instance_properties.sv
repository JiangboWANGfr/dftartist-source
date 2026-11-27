// Agent B independent KAT: two same-definition parameterizations plus an empty instance.
module b_ip_leaf #(parameter int W = 4, parameter type T = logic [W-1:0])
  (input logic [W-1:0] d, output logic [W-1:0] q);
  localparam int DOUBLE_W = W * 2;
  assign q = d;
endmodule
module b_ip_empty;
endmodule
module b_ip_top;
  logic [1:0] d2, q2;
  logic [5:0] d6, q6;
  b_ip_leaf #(.W(2)) narrow (.d(d2), .q(q2));
  b_ip_leaf #(.W(6)) wide (.d(d6), .q(q6));
  b_ip_empty empty ();
endmodule

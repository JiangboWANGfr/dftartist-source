module signed_expression(input wire signed [1:0] a,
                         output wire signed [3:0] extended,
                         output wire [1:0] selected);
  assign extended = a;
  assign {<<{selected}} = a;
endmodule

module expression_occurrences(input wire signed [1:0] a, b,
                              output wire signed [3:0] x, y,
                              output wire [1:0] p, q);
  signed_expression first(a, x, p);
  signed_expression second(b, y, q);
endmodule

module SEC(input func_a, output func_o); endmodule
module CLI(input func_b, output func_c); endmodule
module top(a, b);
  input a; output b;
  SEC sec_i [1:0] (.func_a(a), .func_o(b));
  CLI cli_i (.func_b(a), .func_c(b));
endmodule

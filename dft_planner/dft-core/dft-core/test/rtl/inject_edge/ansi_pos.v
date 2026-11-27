module SEC(input func_a, output func_o); endmodule
module CLI(input func_b, output func_c); endmodule
module top(input a, output b);
  SEC sec_i (a, b);
  CLI \cli_i (a, b);
endmodule

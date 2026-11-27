module kid(input a, input b, input [3:0] c, input d, input e, input signed [3:0] f, input [3:0] g, output y);
  assign y = e & a;
endmodule

module mid(input clk, output z);
  wire w;
  assign w = clk;
  kid u_kid(.a(1'b0), .b(1'b1), .c(4'b0101), .d(), .e(w), .f(-4'sd1), .g(4'd5 + 4'd1), .y(z));
endmodule

module top(input clk, output z);
  mid u_mid(.clk(clk), .z(z));
endmodule

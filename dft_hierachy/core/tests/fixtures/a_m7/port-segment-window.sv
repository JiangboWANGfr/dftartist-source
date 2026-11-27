module segment_leaf(.p({hi, lo}), y);
 output wire [7:0] y;
 input wire [3:0] hi, lo;
 assign y = {hi,lo};
endmodule
module segment_wrap(input wire [7:0] a, output wire [7:0] y);
 segment_leaf u(.p({a[1:0],2'b10,a[7:4]}),.y(y));
endmodule
module segment_top(input wire [7:0] a, output wire [7:0] y0, y1);
 segment_wrap w0(.a(a),.y(y0));
 segment_wrap w1(.a(a),.y(y1));
 segment_wrap w2(.a(a ^ 8'h55),.y());
endmodule

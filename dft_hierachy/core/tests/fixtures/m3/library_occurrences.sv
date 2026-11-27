module c52_array_leaf(input wire [3:0] a [2]);
  absent_c52 u(.A(a));
endmodule
module c52_array_top(input wire [3:0] a [2]);
  c52_array_leaf n0(.a(a));
  c52_array_leaf n1(.a(a));
  c52_array_leaf n2(.a(a));
  c52_array_leaf n3(.a(a));
endmodule
module c52_stream_leaf(input wire [7:0] a);
  absent_c52 u(.A({<<{a}}));
endmodule
module c52_stream_top(input wire [7:0] a);
  c52_stream_leaf n0(.a(a));
  c52_stream_leaf n1(.a(a));
  c52_stream_leaf n2(.a(a));
  c52_stream_leaf n3(.a(a));
endmodule
module c52_target;
  wire [7:0] s;
endmodule
module c52_hier_top;
  c52_target n0();
  c52_target n1();
  c52_target n2();
  c52_target n3();
  absent_c52 reader(.A(n2.s));
endmodule

module plan_leaf(input logic c,input logic [3:0] d,output logic [3:0] q);
  always_ff @(posedge c) q<=d;
endmodule
module plan_top(input logic c,sel,input logic [3:0] d,output wire [3:0] q,
  output wire [3:0] alias_q,output wire pass,constant_o,unknown_o);
  plan_leaf u(c,d,q);
  assign alias_q=q;
  assign pass=d[0];
  assign constant_o=1'b0;
  MISSING m(.Y(unknown_o));
endmodule
module plan_fanout(input logic c,d,output logic [5:0] q);
  always_ff @(posedge c) q<={6{d}};
endmodule
module plan_control(input logic c,sel,a,b,output logic q);
  wire y=sel?a:b;
  always_ff @(posedge c) q<=y;
endmodule
module plan_overlap(input logic c,d,output logic [3:0] q);
  always @(posedge c) q[2:0]<={3{d}};
  always @(posedge c) q[3:1]<={3{d}};
endmodule
module plan_io(inout wire [1:0] p);
endmodule
module plan_multi(input logic c,d,output wire [3:0] a,b);
 plan_leaf u(c,{3'b0,d},a);
 plan_leaf v(c,{3'b0,d},b);
endmodule

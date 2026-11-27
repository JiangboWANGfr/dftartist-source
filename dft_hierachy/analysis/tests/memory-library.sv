module known_ram(input CLK, input [2:0] A, input [7:0] D, output [7:0] Q);
 assign Q = D;
endmodule
module library_top(input clk,input [2:0] a,input [7:0] d,
 output [7:0] q0,q1,q2,q3,q4);
 missing_ram named(.CLK(clk),.A(a),.D(d),.Q(q0));
 missing_ram positional(clk,a,d,q1);
 missing_ram hole(clk,,d,q2);
 known_ram known(clk,a,d,q3);
 missing_ram extra(.CLK(clk),.A(a),.D(d),.Q(q4),.EXTRA(clk));
endmodule

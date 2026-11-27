module sig_dff (sig_out,sig_in,clk,rst_n);
input sig_in,clk,rst_n;
output sig_out;
//reg sig_out;
//always @(posedge clk or negedge rst_n)
//begin
//   if(!rst_n)
//       sig_out <= 1'b0;
//   else 
//       sig_out <= sig_in;
//end
dffr u_dontouch_cell (.D(sig_in), .R(!rst_n), .CLK(clk), .Q(sig_out));
endmodule
module cell_and2 (Z,A1,A2);
input wire A1,A2;
output wire Z;
and02 u_dontouch_cell (.A0(A1),.A1(A2),.Y(Z));
//assign Z = A1 && A2;

endmodule

module cell_or2 (Z,A1,A2);
input wire A1,A2;
output wire Z;
or02 u_dontouch_cell (.A0(A1),.A1(A2),.Y(Z));
//assign Z = A1 | A2;
endmodule

module cell_inv2 (ZN,I);
input wire I;
output wire ZN;
inv01 u_dontouch_cell (.A(I),.Y(ZN));
//assign Z = A1 | A2;
endmodule

module cell_buf (Z,A);
input wire A;
output wire Z;
//assign Z=A;
buf02  u_dontouch_cell (.A(A), .Y(Z));
endmodule

module cell_or3 (Z,A1,A2,A3);
input wire A1,A2,A3;
output wire Z;
//assign Z = A1 | A2 | A3;
or03 u_dontouch_cell (.Y(Z), .A0(A1), .A1(A2), .A2(A3));
endmodule

module dmux2_1 (in1,in2,c,out);
input wire in1,in2,c;
output wire out;
mux21 u_dontouch_cell (.Y(out), .A1(in2), .A0(in1), .S0(c));
//assign out = c ? in2 : in1;
endmodule




module reg_leaf(input logic clk,input logic[31:0] a,output logic[63:0] q);
 always_ff @(posedge clk) begin
  q[0] <= a[0];
  q[2] <= a[1];
  q[4] <= a[2];
  q[6] <= a[3];
  q[8] <= a[4];
  q[10] <= a[5];
  q[12] <= a[6];
  q[14] <= a[7];
  q[16] <= a[8];
  q[18] <= a[9];
  q[20] <= a[10];
  q[22] <= a[11];
  q[24] <= a[12];
  q[26] <= a[13];
  q[28] <= a[14];
  q[30] <= a[15];
  q[32] <= a[16];
  q[34] <= a[17];
  q[36] <= a[18];
  q[38] <= a[19];
  q[40] <= a[20];
  q[42] <= a[21];
  q[44] <= a[22];
  q[46] <= a[23];
  q[48] <= a[24];
  q[50] <= a[25];
  q[52] <= a[26];
  q[54] <= a[27];
  q[56] <= a[28];
  q[58] <= a[29];
  q[60] <= a[30];
  q[62] <= a[31];
 end
endmodule
module reg_top(input logic clk,input logic[31:0] a,output logic[63:0] q0,q1);
 reg_leaf first(clk,a,q0),second(clk,a,q1);
endmodule

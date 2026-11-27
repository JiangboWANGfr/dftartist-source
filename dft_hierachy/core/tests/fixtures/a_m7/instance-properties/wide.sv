module property_wide_leaf #(parameter int P0=0,parameter int P1=1,parameter int P2=2,parameter int P3=3,parameter int P4=4,parameter int P5=5,parameter int P6=6,parameter int P7=7,parameter int P8=8,parameter int P9=9,parameter int P10=10,parameter int P11=11,parameter int P12=12,parameter int P13=13,parameter int P14=14,parameter int P15=15) (input wire p0,input wire p1,input wire p2,input wire p3,input wire p4,input wire p5,input wire p6,input wire p7,input wire p8,input wire p9,input wire p10,input wire p11); endmodule
module property_wide_top;
 property_wide_leaf #(.P0(0),.P1(1),.P2(2),.P3(3),.P4(4),.P5(5),.P6(6),.P7(7),.P8(8),.P9(9),.P10(10),.P11(11),.P12(12),.P13(13),.P14(14),.P15(15)) explicit_same();
 property_wide_leaf implicit_default();
 mystery ghost(.A(1'b0), .Y());
endmodule

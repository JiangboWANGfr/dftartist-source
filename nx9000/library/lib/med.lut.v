/*
 * RTLC LUTs inferred in macros
 * for technology mapping to Crystal FPGAs
 */

// `ifndef _MED_LUT_V_ -- vsyn does not support this
// `define _MED_LUT_V_

// mux_2_1
module MED_LUT3_E4 (O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & I2) | ((! I0) & I1);
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT3_E4

//MuxNN
module MED_LUT4_F888(O,I0,I1,I2,I3);
output O;
input I0;
input I1;
input I3;
input I2;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & I1) | (I2 & I3);
`endif //MED_LUT_DEFINITION
endmodule // MED_LUT4_F888

// ABS
module MED_LUT3_D2(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;
 
`ifdef MED_LUT_DEFINITION
assign O = ((! I0) & I2) | (I0 & ((! I2) ^ I1));  
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT3_D2

// ADD_SUB
module MED_LUT4_BE28(O,I0,I1,I2,I3);
output O;
input I2;
input I1;
input I0;
input I3;

`ifdef MED_LUT_DEFINITION
assign O = (I3 & (I2 ^ I1)) | (I3 & I0) | (I0 & (I2 ^ I1));       
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT4_BE28

//carry logic
module MED_LUT3_E8(O,I0,I1,I2);
output O;
input I0;
input I1;
input I2;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & I1) | (I1 & I2) | (I2 & I0);
`endif //MED_LUT_DEFINITION
endmodule

//first stage cout
module MED_LUT2_D(O,I0,I1);
output O;
input I0;
input I1;
 
`ifdef MED_LUT_DEFINITION
assign O = I1 | (!I0);
`endif //MED_LUT_DEFINITION
endmodule 

// 
module MED_LUT3_B2(O,I0,I1,I2);
output O;
input I0;
input I1;
input I2;
 
`ifdef MED_LUT_DEFINITION
assign O = (I0 & I2) | (I0 & (! I1)) | (I2 & (! I1));
`endif //MED_LUT_DEFINITION
endmodule // MED_LUT3_B2

// LT (For last stage Cout)
// 
module MED_LUT3_4D (O,I0,I1,I2);
output O;
input I0;
input I1;
input I2;
 
`ifdef MED_LUT_DEFINITION
assign O = ! ((I0 & I2) | (I0 & (! I1)) | (I2 & (! I1)));
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT3_4D

// LT_SIGN (For last stage Cout)
// 
module MED_LUT3_69(O,I0,I1,I2);
output O;
input I0;
input I1;
input I2;
 
`ifdef MED_LUT_DEFINITION
assign O = I0 ^ (! I1) ^ I2;
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT3_69

module MED_LUT3_96(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I2 ^ ( I0 ^ I1 );
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT3_96

module MED_LUT3_71(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = ((!I0) & (!I1)) | ((!I0) & I2) | ((!I1) & I2);
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT3_71

module MED_LUT3_90(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I2 & ( ! (I0 ^ I1) );
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_90

module MED_LUT4_8421(O,I0,I1,I2,I3);
output O;
input I0;
input I1;
input I3;
input I2;

`ifdef MED_LUT_DEFINITION
assign O   = (~(I0 ^ I2)) & (~(I1 ^ I3));
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_8421

module MED_LUT3_F8(O,I0,I1,I2);
output O;
input I0;
input I1;
input I2;

`ifdef MED_LUT_DEFINITION
assign O = I2 | I1 & I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_F8

module MED_LUT4_0777(O,I0,I1,I2,I3);
output O;
input I0;
input I1;
input I2;
input I3;

`ifdef MED_LUT_DEFINITION
assign O = !( (I0&I1) | (I2&I3) );
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_EEE0

module MED_LUT4_8000(O,I0,I1,I2,I3);
output O;
input I0;
input I1;
input I2;
input I3;

`ifdef MED_LUT_DEFINITION
assign O = I3 & I2 & I1 & I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_8000

module MED_LUT4_0001(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = ! (I3 | I2 | I1 | I0);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0001

module MED_LUT2_8(O,I0,I1);
output O;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I1 & I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_8

module MED_LUT3_80(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I1 & I2 & I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_80

module MED_LUT2_E(O,I0,I1);
output O;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I1 | I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_7

module MED_LUT3_FE(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I2 | I1 | I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_FE

module MED_LUT4_FFFE(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I3 | I2 | I1 | I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_7FFF

module MED_LUT2_7(O,I0,I1);
output O;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = !(I1 & I0);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_7

module MED_LUT4_7FFF(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = !(I3 & I2 & I1 & I0);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_7FFF

module MED_LUT3_7F(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = !(I2 & I1 & I0);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_7F

module MED_LUT3_01(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = !(I2 | I1 | I0);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_01

module MED_LUT2_1(O,I0,I1);
output O;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = !(I1 | I0);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_1

module MED_LUT2_6(O,I0,I1);
output O;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I1 ^ I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_6

module MED_LUT2_2(O,I0,I1);
output O;
input I0;
input I1;

`ifdef MED_LUT_DEFINITION
assign O = I0 & (! I1);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_4

module MED_LUT2_4(O,I0,I1);
output O;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (! I0 ) & I1;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_2

module MED_LUT3_20(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I2 & (! I1) & I0;
`endif //MED_LUT_DEFINITION

endmodule // MED_LUT3_20

module MED_LUT3_02(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & (! I1) & (! I2);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_02

module MED_LUT3_40(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (! I0) & I1 & I2;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_40

module MED_LUT3_04(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (! I0) & I1 & (! I2);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_20

module MED_LUT3_10(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & (!I1) & I2;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_08

module MED_LUT4_0080(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & I1 & I2 & ( ! I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0100

module MED_LUT4_0800(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & I1 & (! I2) & I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0800

module MED_LUT4_0008(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & I1 & (! I2) & (! I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_1000

module MED_LUT4_2000(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & (!I1) & I2 & I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_2000

module MED_LUT4_0020(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & (! I1) & I2 & (! I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0020

module MED_LUT4_0200(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & (!I1) & (! I2) & I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0200

module MED_LUT4_0002(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & (!I1) & (!I2) & (!I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0002

module MED_LUT4_4000(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & I1 & I2 & I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_4000

module MED_LUT4_0040(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & I1 & I2 & (!I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0040

module MED_LUT4_0400(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & I1 & (!I2) & I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0400

module MED_LUT4_0004(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & I1 & (!I2) & (!I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0004

module MED_LUT4_1000(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & (!I1) & I2 & I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_1000

module MED_LUT4_0010(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & (!I1) & I2 & (!I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0010

module MED_LUT4_0100(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) & (!I1) & (!I2) & I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_0080

module MED_LUT4_27D8(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & (I1 ^ I3)) | (!I0 & (I2 ^ I3));
`endif //MED_LUT_DEFINITION

endmodule //sLUT4_1A66

module MED_LUT4_D827(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & (!I1 ^ I3) ) |  (!I0 & (!I2 ^ I3));
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_D827

module MED_LUT3_AC(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I2 & I0) | ((!I2) & I1);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_AC


module MED_LUT1_1 (O,I0);
output O;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = ! I0;
`endif //MED_LUT_DEFINITION
endmodule // MED_LUT1_1 

module MED_LUT1_2(O,I0);
output O;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT1_2

module MED_LUT2_9(O,I0,I1);
output O;
input I0;
input I1;

`ifdef MED_LUT_DEFINITION
assign O = (!I0) ^ I1;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT2_9

module MED_LUT3_78(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & I1 ) ^ I2;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_78

module MED_LUT3_87(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & I1 ) ^ (!I2);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_87

module MED_LUT3_E1(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I0 | I1 ) ^ (!I2);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_E1

module MED_LUT3_B4(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = ((!I0) & I1 ) ^ I2;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_B4

module MED_LUT3_08(O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I0 & I1 & (! I2 );
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT3_08

module MED_LUT4_7888(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I0 & I1) ^ (I2 & I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_7888

module MED_LUT4_EF80(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = ( ( !I3 & (I2 & I1 & I0) ) | ( I3 & ! (I2 & !I1 & !I0)));
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_EF80

module MED_LUT4_B444(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = ((!I0) & I1) ^ (I2 & I3);
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_B444

module MED_LUT4_B44B(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = ((!I0) & I1) ^ (!I2) ^ I3;
`endif //MED_LUT_DEFINITION

endmodule //MED_LUT4_B44B
module MED_LUT4_4F04(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (((!I0) & I1) & (!I2)) | ((!I2) & I3) | (((!I0) & I1) & I3);
`endif //MED_LUT_DEFINITION

endmodule//MED_LUT4_4F04

module MED_LUT4_6996(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = I3 ^ I2 ^ I1 ^ I0;
`endif //MED_LUT_DEFINITION

endmodule//MED_LUT4_6996

module MED_LUT4_7D28(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;
 
`ifdef MED_LUT_DEFINITION
assign O = ( ( (I1 ^ I2) & I0 ) | ( !I0 & I3 ) );
`endif //MED_LUT_DEFINITION
 
endmodule //MED_LUT4_7D28
 
module MED_LUT4_D782(O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;
 
`ifdef MED_LUT_DEFINITION
assign O = ( ( (!I1 ^ I2) & I0 ) | ( !I0 & I3 ) );
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT4_D782

// These are used in inferCLA
module MED_LUT3_F4 (O,I0,I1,I2);
output O;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I2) | ((! I0) & I1);
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT3_F4

module MED_LUT4_FFF8 (O,I0,I1,I2,I3);
output O;
input I3;
input I2;
input I1;
input I0;

`ifdef MED_LUT_DEFINITION
assign O = (I3) | (I2) | ((I0) & I1);
`endif //MED_LUT_DEFINITION
endmodule //MED_LUT4_FFF8

module MED_LUT4_E8C0 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I1) | (I3 & I1 & I0) | (I3 & I2 & I0));
`endif
endmodule

module MED_LUT4_FCE8 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1 & I0) | (I2 & I0) | (I2 & I1) | (I3 & I1) | (I3 & I2));
`endif
endmodule

module MED_LUT4_0880 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION
	assign	O = ((I3 & ~I2 & I1 & I0) | (~I3 & I2 & I1 & I0));
`endif
endmodule

module MED_LUT4_4800 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION
	assign	O = ((I3 & I2 & I1 & ~I0) | (I3 & ~I2 & I1 & I0));
`endif
endmodule

module MED_LUT4_566A (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION
	assign	O = ((I2 & I1 & ~I0) | (~I2 & ~I1 & I0) | (I3 & I1 & ~I0) | (I3 & I2 & ~I0) | (~I3 & ~I1 & I0) | (~I3 & ~I2 & I0));
`endif
endmodule

module MED_LUT4_9996 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION
	assign	O = ((I2 & I1 & I0) | (I2 & ~I1 & ~I0) | (I3 & I1 & I0) | (I3 & ~I1 & ~I0) | (~I3 & ~I2 & I1 & ~I0) | (~I3 & ~I2 & ~I1 & I0));
`endif
endmodule

module MED_LUT4_0660 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION
	assign	O = (((I1 & ~I0) | (~I1 & I0)) & ((I2 & ~I3) | (~I2 & I3)));
`endif
endmodule

module MED_LUT4_E8A0 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I0) | (I3 & I1 & I0) | (I3 & I2 & I1));
`endif
endmodule

module MED_LUT4_ECCC (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1) | (I3 & I2 & I0));
`endif
endmodule

module MED_LUT4_FFC8 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I3) | (I1 & I0) | (I2 & I1));
`endif
endmodule

module MED_LUT4_FCEC (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1) | (I2 & I0) | (I3 & I2));
`endif
endmodule

module MED_LUT4_FFEA (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I0) | (I3) | (I2 & I1));
`endif
endmodule

module MED_LUT4_EC00 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I3 & I1) | (I3 & I2 & I0));
`endif
endmodule

module MED_LUT4_FE01(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = (I0 | I1 | I2) ^ (!I3);
`endif
endmodule //MED_LUT4_FE01

module MED_LUT4_7F80(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = I3 ^ (I2 & I1 & I0);
`endif
endmodule //MED_LUT4_7F80

module MED_LUT4_9009(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = (((!I2) ^ I3) && ((!I0) ^ I1));
`endif
endmodule //MED_LUT4_9009

module MED_LUT4_FF40(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = (I3 || (I2 && (I1 && (!I0))));
`endif
endmodule //MED_LUT4_FF90

module MED_LUT4_4B44(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((!I0) & I1) ^ ((!I2) & I3);
`endif
endmodule //MED_LUT4_4B44

module MED_LUT4_8778(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = (I0 & I1) ^ I2 ^ I3;
`endif
endmodule //MED_LUT4_8778

module MED_LUT4_F880(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I0 & I1) & I2) | (I2 & I3) | (I3 & (I0 & I1)) ;
`endif
endmodule //MED_LUT4_F880

module MED_LUT4_4BB4(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = (!I0 & I1) ^ I2 ^ I3;
`endif
endmodule //MED_LUT4_4BB4

module MED_LUT4_F440(O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((!I0 & I1) & I2) | (I2 & I3) | (I3 & (!I0 & I1)) ;
`endif
endmodule //MED_LUT4_F440

module MED_LUT4_F0CA (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
assign O = (((I2 & I1) | (I3 & I2)) | (((~I3) & (~I2)) & I0));
`endif
endmodule //MED_LUT4_F0CA

module MED_LUT4_E4AA (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
assign O = (((I2 & I0) | ((~I3) & I0)) | ((I3 & I1) & (~I0)));
`endif
endmodule //MED_LUT4_E4AA


module MED_LUT3_6A (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2;

`ifdef MED_LUT_DEFINITION
	assign O = ((((~I1) & I0) | ((~I2) & I0)) | ((I2 & I1) & (~I0)));
`endif
endmodule

module MED_LUT3_A6 (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I1) & I0) | (I2 & I0)) | (((~I2) & I1) & (~I0)));
`endif
endmodule

module MED_LUT3_9A (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I1 & I0) | ((~I2) & I0)) | ((I2 & (~I1)) & (~I0)));
`endif
endmodule

module MED_LUT4_8878 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((((~I2) & I1) & I0) | ((I3 & I1) & I0)) | (((~I3) & I2) & (~I0))) | (((~I3) & I2) & (~I1)));
`endif
endmodule

module MED_LUT4_8788 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((I2 & I1) & I0) | ((I3 & (~I2)) & (~I0))) | ((I3 & (~I2)) & (~I1))) | (((~I3) & I1) & I0));
`endif
endmodule

module MED_LUT4_D222 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((((~I2) & (~I1)) & I0) | ((I3 & I2) & (~I0))) | ((I3 & I2) & I1)) | (((~I3) & (~I1)) & I0));
`endif
endmodule

module MED_LUT4_22D2 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((((~I2) & (~I1)) & I0) | ((I3 & (~I1)) & I0)) | (((~I3) & I2) & (~I0))) | (((~I3) & I2) & I1));
`endif
endmodule

module MED_LUT4_2D22 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((I2 & (~I1)) & I0) | ((I3 & (~I2)) & (~I0))) | ((I3 & (~I2)) & I1)) | (((~I3) & (~I1)) & I0));
`endif
endmodule

module MED_LUT4_44B4 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((((~I2) & I1) & (~I0)) | ((I3 & I1) & (~I0))) | (((~I3) & I2) & I0)) | (((~I3) & I2) & (~I1)));
`endif
endmodule

module MED_LUT4_17E8 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((((I3 & (~I1)) & (~I0)) | ((I3 & (~I2)) & (~I0))) | ((I3 & (~I2)) & (~I1))) | (((~I3) & I1) & I0)) | (((~I3) & I2) & I0)) | (((~I3) & I2) & I1));
`endif
endmodule

module MED_LUT3_E0 (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I2 & I0) | (I2 & I1));
`endif
endmodule

module MED_LUT3_EC (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (I1 | (I2 & I0));
`endif
endmodule

module MED_LUT4_EC80 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & I1) | ((I2 & I1) & I0)) | ((I3 & I2) & I0));
`endif
endmodule

module MED_LUT4_1248 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((((I3 & I2) & (~I1)) & (~I0)) | (((I3 & (~I2)) & (~I1)) & I0)) | ((((~I3) & I2) & I1) & (~I0))) | ((((~I3) & (~I2)) & I1) & I0));
`endif
endmodule

module MED_LUT3_60 (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I2 & I1) & (~I0)) | ((I2 & (~I1)) & I0));
`endif
endmodule

module MED_LUT4_E817 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((((I3 & I1) & I0) | ((I3 & I2) & I0)) | ((I3 & I2) & I1)) | (((~I3) & (~I1)) & (~I0))) | (((~I3) & (~I2)) & (~I0))) | (((~I3) & (~I2)) & (~I1)));
`endif
endmodule

module MED_LUT4_13EC (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((~I3) & I1) | ((I3 & (~I1)) & (~I0))) | ((I3 & (~I2)) & (~I1))) | (((~I3) & I2) & I0));
`endif
endmodule

module MED_LUT4_363C (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((I2 & (~I1)) | (((~I2) & I1) & (~I0))) | ((I3 & (~I1)) & I0)) | (((~I3) & (~I2)) & I1));
`endif
endmodule

module MED_LUT4_FEFC (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I1 | I2) | (I3 & I0));
`endif
endmodule

module MED_LUT3_EA (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (I0 | (I2 & I1));
`endif
endmodule

module MED_LUT4_EAAA (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (I0 | ((I3 & I2) & I1));
`endif
endmodule

module MED_LUT4_CC80 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I3 & I1) | ((I2 & I1) & I0));
`endif
endmodule

module MED_LUT4_FAF8 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I2 | (I1 & I0)) | (I3 & I0));
`endif
endmodule

module MED_LUT3_A9 (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I1 & I0) | (I2 & I0)) | (((~I2) & (~I1)) & (~I0)));
`endif
endmodule

//DUHOON Adding behavc-specific lut definition
//These Luts have been used in Behavc-Macro expansion
module MED_LUT3_1F (O, I0, I1, I2);
output O;
input I0;
input I1;
input I2;
`ifdef MED_LUT_DEFINITION
        assign O = ((~I2) | ((~I1) & (~I0)));
`endif
endmodule //MED_LUT3_1F
                                                                                
module MED_LUT4_111F (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = (((~I1) & (~I0)) | ((~I3) & (~I2)));
`endif
endmodule //MED_LUT4_111F
                                                                                
module MED_LUT4_FE00 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = (((I3 & I0) | (I3 & I1)) | (I3 & I2));
`endif
endmodule // MED_LUT4_FE00
                                                                                
                                                                                
module MED_LUT4_6FF6 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = ( (I0 ^ I1) | (I2 ^ I3) );
`endif
endmodule // MED_LUT4_6FF6
                                                                                
                                                                                
module MED_LUT4_4F44 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = ( ((!I0) & I1) | ((!I2) & I3) );
`endif
endmodule // MED_LUT4_4F44
                                                                                
module MED_LUT4_22F2 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = ( ((I0) & (!I1)) | ((I2) & (!I3)) );
`endif
endmodule // MED_LUT4_22F2
                                                                                
module MED_LUT4_6F66 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = ( ((I0) ^ (I1)) | ((!I2) & (I3)) );
`endif
endmodule // MED_LUT4_6F66
                                                                                
module MED_LUT4_66F6 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = ( ((I0) ^ (I1)) | ((I2) & (!I3)) );
`endif
endmodule // MED_LUT4_66F6
                                                                                
module MED_LUT4_44F4 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
        assign O = ( ((!I0) & (I1)) | ((I2) & (!I3)) );
`endif
endmodule // MED_LUT4_44F4
                                                                                
module MED_LUT3_F6 (O, I0, I1, I2);
output O;
input I0;
input I1;
input I2;
`ifdef MED_LUT_DEFINITION
    assign O = ((I2 | (I1 & (~I0))) | ((~I1) & I0));
`endif
endmodule //MED_LUT3_F6
                                                                                
module MED_LUT4_FFF6 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
    assign O = (((I2 | I3) | (I1 & (~I0))) | ((~I1) & I0));
`endif
endmodule //MED_LUT4_FFF6
                                                                                
module MED_LUT3_F4 (O, I0, I1, I2);
output O;
input I0;
input I1;
input I2;
`ifdef MED_LUT_DEFINITION
    assign O = (I2 | ((!I0) & I1));
`endif
endmodule //MED_LUT3_F4
                                                                                
module MED_LUT4_FFF4 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
    assign O = ((I2 | I3) | (I1 & (~I0)));
`endif
endmodule //MED_LUT4_FFF4
                                                                                
module MED_LUT3_F2 (O, I0, I1, I2);
output O;
input I0;
input I1;
input I2;
`ifdef MED_LUT_DEFINITION
    assign O = (I2 | ((~I1) & I0));
`endif
endmodule //MED_LUT3_F2
                                                                                
module MED_LUT4_FFF2 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
    assign O = ((I2 | I3) | ((~I1) & I0));
`endif
endmodule //MED_LUT4_FFF2

module MED_LUT4_CCAE (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
assign O = ((((~I2) & I1) | (I3 & I1)) | ((~I3) & I0));
`endif
endmodule
		

module MED_LUT3_AE(O,I0,I1,I2);
    output O;
    input I0;
    input I1;
    input I2;
`ifdef MED_LUT_DEFINITION
    assign O = (I0 | ((~I2) & I1));
`endif
endmodule


module MED_LUT3_A8 (O, I0, I1, I2);
output O;
input I0;
input I1;
input I2;
`ifdef MED_LUT_DEFINITION
    assign O = ((I1 & I0) | (I2 & I0));
`endif
endmodule


module MED_LUT4_EEE4 (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
    assign O = (((I1 & (~I0)) | (I2 & I0)) | (I3 & I0));
`endif
endmodule

module MED_LUT2_B (O, I0, I1);
output O; 
input I0; 
input I1; 
`ifdef MED_LUT_DEFINITION
	assign O = (I0 | (~I1));
`endif
endmodule

module MED_LUT3_FD (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (((~I0) | I1) | I2);
`endif
endmodule

module MED_LUT4_FD02 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((I3 & (~I0)) | (I3 & I1)) | (I3 & I2)) | ((((~I3) & (~I2)) & (~I1)) & I0));
`endif
endmodule

module MED_LUT4_FFFD (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I0) | I1) | I2) | I3);
`endif
endmodule

module MED_LUT3_EF (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I0 | I1) | (~I2));
`endif
endmodule

module MED_LUT4_FEFF (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I0 | I1) | I2) | (~I3));
`endif
endmodule

module MED_LUT3_2B (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I1) & I0) | ((~I2) & I0)) | ((~I2) & (~I1)));
`endif
endmodule

module MED_LUT4_40F4 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I3) & I2) | ((I2 & I1) & (~I0))) | (((~I3) & I1) & (~I0)));
`endif
endmodule

module MED_LUT4_B0FB (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((I2 & I0) | (I2 & (~I1))) | ((~I3) & I0)) | ((~I3) & (~I1))) | ((~I3) & I2));
`endif
endmodule

module MED_LUT3_D4 (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I1 & (~I0)) | (I2 & (~I0))) | (I2 & I1));
`endif
endmodule

module MED_LUT3_17 (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I1) & (~I0)) | ((~I2) & (~I0))) | ((~I2) & (~I1)));
`endif
endmodule

module MED_LUT4_00AC (O, I0, I1, I2, I3);
output O;
input I0;
input I1;
input I2;
input I3;
`ifdef MED_LUT_DEFINITION
    assign O = ((((~I3) & I2) & I0) | (((~I3) & (~I2)) & I1));
`endif
endmodule

module MED_LUT4_FE04 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & I0) | (I3 & I2)) | (((~I2) & I1) & (~I0)));
`endif
endmodule

module MED_LUT4_63CC (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((~I3) & I1) | ((I2 & I1) & (~I0))) | ((I3 & (~I1)) & I0)) | ((I3 & (~I2)) & (~I1)));
`endif
endmodule

module MED_LUT4_1EF0 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((~I3) & I2) | ((I2 & (~I1)) & (~I0))) | ((I3 & (~I2)) & I0)) | ((I3 & (~I2)) & I1));
`endif
endmodule

module MED_LUT4_5A9A (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((~I2) & I0) | ((I2 & (~I1)) & (~I0))) | ((I3 & I2) & (~I0))) | (((~I3) & I1) & I0));
`endif
endmodule

module MED_LUT4_FFE4 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I3 | (I1 & (~I0))) | (I2 & I0));
`endif
endmodule

module MED_LUT4_3C2C (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I2) & I1) | ((I2 & (~I1)) & I0)) | ((I3 & I2) & (~I1)));
`endif
endmodule

module MED_LUT4_3C6C (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((~I2) & I1) | ((I2 & (~I1)) & I0)) | ((I3 & I2) & (~I1))) | (((~I3) & I1) & (~I0)));
`endif
endmodule

module MED_LUT4_93CC (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((((~I3) & I1) | ((I2 & I1) & I0)) | ((I3 & (~I1)) & (~I0))) | ((I3 & (~I2)) & (~I1)));
`endif
endmodule

module MED_LUT4_E020 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & ~I1 & I0) | (I3 & I2 & I1));
`endif
endmodule

module MED_LUT3_B8 (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1 & I0) | (I2 & ~I1));
`endif
endmodule

module MED_LUT3_8A (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1 & I0) | (~I2 & I0));
`endif
endmodule

module MED_LUT4_2230 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I3 & ~I1 & I0) | (~I3 & I2 & ~I1));
`endif
endmodule

module MED_LUT4_BA8A (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1 & I0) | (~I2 & I0) | (I3 & I2 & ~I1));
`endif
endmodule

module MED_LUT3_75 (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I0) | (I2 & ~I1));
`endif
endmodule

module MED_LUT3_BA (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I0) | (I2 & ~I1));
`endif
endmodule

module MED_LUT3_32 (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I1 & I0) | (I2 & ~I1));
`endif
endmodule

module MED_LUT3_E2 (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I1 & I0) | (I2 & I1));
`endif
endmodule

module MED_LUT4_F870 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & ~I0) | (I2 & ~I1) | (I3 & I1 & I0));
`endif
endmodule

module MED_LUT3_CA (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I1) | (~I2 & I0));
`endif
endmodule

module MED_LUT4_F4B0 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I0) | (I2 & ~I1) | (I3 & I1 & ~I0));
`endif
endmodule

module MED_LUT4_5410 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & ~I1 & ~I0) | (I3 & I1 & ~I0));
`endif
endmodule
module MED_LUT4_8A80 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I1 & I0) | (I3 & ~I2 & I0));
`endif
endmodule

module MED_LUT4_ECA0 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I0) | (I3 & I1));
`endif
endmodule

module MED_LUT4_FF80 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I3) | (I2 & I1 & I0));
`endif
endmodule

module MED_LUT3_D8 (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1 & I0) | (I2 & ~I0));
`endif
endmodule

module MED_LUT4_F444 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1 & ~I0) | (I3 & I2));
`endif
endmodule

module MED_LUT4_DF80 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I3 & ~I0) | (I3 & ~I2) | (I2 & I1 & I0));
`endif
endmodule

module MED_LUT3_4E (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I1 & ~I0) | (~I2 & I0));
`endif
endmodule

module MED_LUT4_FB40 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I3 & I0) | (I3 & ~I1) | (I2 & I1 & ~I0));
`endif
endmodule

module MED_LUT4_F222 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I1 & I0) | (I3 & I2));
`endif
endmodule

module MED_LUT3_5D (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I0) | (~I2 & I1));
`endif
endmodule

module MED_LUT3_A2 (O, I0, I1, I2);
output	O;
input	I0;
input	I1;
input	I2;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I1 & I0) | (I2 & I0));
`endif
endmodule

module MED_LUT4_FD08 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I3 & ~I0) | (I3 & I2) | (~I2 & I1 & I0));
`endif
endmodule

module MED_LUT4_C840 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I1 & ~I0) | (I3 & I1 & I0));
`endif
endmodule

module MED_LUT4_F5DD (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I0) | (I3 & I2) | (~I3 & I1));
`endif
endmodule

module MED_LUT4_0EEE (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I2 & I0) | (~I2 & I1) | (~I3 & I0) | (~I3 & I1));
`endif
endmodule

module MED_LUT4_AAE2 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I1 & I0) | (I3 & I0) | (~I3 & I2 & I1));
`endif
endmodule

module MED_LUT4_2202 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((~I2 & ~I1 & I0) | (I3 & ~I1 & I0));
`endif
endmodule

module MED_LUT4_C5C0 (O, I0, I1, I2, I3);
output	O;
input	I0;
input	I1;
input	I2;
input	I3;

`ifdef MED_LUT_DEFINITION

	assign	O = ((I2 & I1) | (I3 & ~I2 & ~I0));
`endif
endmodule

module MED_LUT4_C0A0 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & I2) & I1) | (((~I3) & I2) & I0));
`endif
endmodule

module MED_LUT4_CA00 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & I2) & I1) | ((I3 & (~I2)) & I0));
`endif
endmodule

module MED_LUT4_B8F0 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I2 & (~I1)) | ((~I3) & I2)) | ((I3 & I1) & I0));
`endif
endmodule

module MED_LUT4_F08B (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & I2) | (((~I3) & I1) & I0)) | (((~I3) & (~I2)) & (~I1)));
`endif
endmodule

module MED_LUT4_AAC5 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & I0) | (((~I3) & I2) & I1)) | (((~I3) & (~I2)) & (~I0)));
`endif
endmodule

module MED_LUT4_F2F0 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (I2 | ((I3 & (~I1)) & I0));
`endif
endmodule

module MED_LUT4_CAFF (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((~I3) | (I2 & I1)) | ((~I2) & I0));
`endif
endmodule

module MED_LUT4_22F0 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((~I3) & I2) | ((I3 & (~I1)) & I0));
`endif
endmodule

module MED_LUT3_8B (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I1 & I0) | ((~I2) & (~I1)));
`endif
endmodule

module MED_LUT4_8BF0 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I3) & I2) | ((I3 & I1) & I0)) | ((I3 & (~I2)) & (~I1)));
`endif
endmodule

module MED_LUT3_C5 (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = ((I2 & I1) | ((~I2) & (~I0)));
`endif
endmodule

module MED_LUT4_A088 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & I2) & I0) | (((~I3) & I1) & I0));
`endif
endmodule

module MED_LUT4_2FE0 (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = (((I3 & (~I2)) | ((I2 & (~I1)) & I0)) | (((~I3) & I2) & I1));
`endif
endmodule

module MED_LUT3_2E (O, I0, I1, I2);
output O; 
input I0; 
input I1; 
input I2; 
`ifdef MED_LUT_DEFINITION
	assign O = (((~I1) & I0) | ((~I2) & I1));
`endif
endmodule

module MED_LUT4_C5AA (O, I0, I1, I2, I3);
output O; 
input I0; 
input I1; 
input I2; 
input I3; 
`ifdef MED_LUT_DEFINITION
	assign O = ((((~I3) & I0) | ((I3 & I2) & I1)) | ((I3 & (~I2)) & (~I0)));
`endif
endmodule


// `endif // _MED_LUT_V_

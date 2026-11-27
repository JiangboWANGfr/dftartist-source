`timescale 1ns / 10ps

`celldefine
module iopad (OEN,PAD,I,C);
input OEN,I;
output C;
inout PAD;

        ipad iopad_ipad_inst (.PAD(PAD),.C(C));
        opad iopad_opad_inst (.I(I),.PAD(PAD),.OEN(OEN));
        

	/////////////////////////////////////
	//             TIMING              //
	/////////////////////////////////////

	specify
		specparam tpd_I_PAD = 0;
		specparam tpd_PAD_C = 0;
		specparam tpd_OEN_PAD_posedge = 0;
		specparam tpd_PAD_C_posedge = 0;

		(I => PAD) = tpd_I_PAD;
		(posedge OEN => (PAD:1)) = tpd_OEN_PAD_posedge;

		(PAD => C) = tpd_PAD_C;
		(posedge PAD => (C:1)) = tpd_PAD_C_posedge;

	endspecify
endmodule
`endcelldefine

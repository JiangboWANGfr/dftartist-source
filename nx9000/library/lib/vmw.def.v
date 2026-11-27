module RTLC_VMW_AND2( Z, A, B);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_8	rtlclut_inst (.O(Z), .I0(A), .I1(B));
	//     {Z} = A B
endmodule

module RTLC_VMW_AND3( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_80	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A B C
endmodule

module RTLC_VMW_AND4( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_8000	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A B C D
endmodule

module RTLC_VMW_AND5( Z, A, B, C, D, E);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;

wire	rtlcint_4;
	MED_LUT3_80	rtlclut_inst (.O(rtlcint_4), .I0(A), .I1(B), .I2(C));
	//     [4775] = A B C
	MED_LUT3_80	rtlclut_inst_0 (.O(Z), .I0(D), .I1(E), .I2(rtlcint_4));
	//     {Z} = D E [4775]
endmodule

module RTLC_VMW_AO211( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_FFF8	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A B + C + D
endmodule

module RTLC_VMW_AO21( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_F8	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A B + C
endmodule

module RTLC_VMW_AO222( Z, A, B, C, D, E, F);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;
input	F ;
wire	F ;

wire	rtlcint_5;
	MED_LUT4_F888	rtlclut_inst (.O(rtlcint_5), .I0(C), .I1(D), .I2(E), .I3(F));
	//     [4931] = C D + E F
	MED_LUT3_F8	rtlclut_inst_0 (.O(Z), .I0(A), .I1(B), .I2(rtlcint_5));
	//     {Z} = A B + [4931]
endmodule

module RTLC_VMW_AO22( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_F888	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A B + C D
endmodule

module RTLC_VMW_AOI211( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_0007	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A' C' D' + B' C' D'
endmodule

module RTLC_VMW_AOI21( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_07	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A' C' + B' C'
endmodule

module RTLC_VMW_AOI222( Z, A, B, C, D, E, F);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;
input	F ;
wire	F ;

wire	rtlcint_7;
	MED_LUT4_F888	rtlclut_inst (.O(rtlcint_7), .I0(C), .I1(D), .I2(E), .I3(F));
	//     [4974] = C D + E F
	MED_LUT3_07	rtlclut_inst_0 (.O(Z), .I0(A), .I1(B), .I2(rtlcint_7));
	//     {Z} = A' [4974]' + B' [4974]'
endmodule

module RTLC_VMW_AOI22( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_0777	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A' C' + A' D' + B' C' + B' D'
endmodule

module RTLC_VMW_BUF( Z, A);
output	Z ;
wire	Z ;
input	A ;
wire	A ;

	assign	Z = A;
endmodule

module RTLC_VMW_DEC24L( Z0, Z1, Z2, Z3, A, B);
output	Z0 ;
wire	Z0 ;
output	Z1 ;
wire	Z1 ;
output	Z2 ;
wire	Z2 ;
output	Z3 ;
wire	Z3 ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_E	rtlclut_inst (.O(Z0), .I0(A), .I1(B));
	//     {Z0} = A + B
	MED_LUT2_D	rtlclut_inst_0 (.O(Z1), .I0(A), .I1(B));
	//     {Z1} = A' + B
	MED_LUT2_B	rtlclut_inst_1 (.O(Z2), .I0(A), .I1(B));
	//     {Z2} = A + B'
	MED_LUT2_7	rtlclut_inst_2 (.O(Z3), .I0(A), .I1(B));
	//     {Z3} = A' + B'
endmodule

module RTLC_VMW_FADD( S, CO, CI, A, B);
output	S ;
wire	S ;
output	CO ;
wire	CO ;
input	CI ;
wire	CI ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT3_96	rtlclut_inst (.O(S), .I0(CI), .I1(A), .I2(B));
	//     {S} = A B CI + A B' CI' + A' B CI' + A' B' CI
	MED_LUT3_E8	rtlclut_inst_0 (.O(CO), .I0(CI), .I1(A), .I2(B));
	//     {CO} = A B + A CI + B CI
endmodule

module RTLC_VMW_HADD( S, CO, A, B);
output	S ;
wire	S ;
output	CO ;
wire	CO ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_6	rtlclut_inst0 (.O(S), .I0(A), .I1(B));
	MED_LUT2_8	rtlclut_inst1 (.O(CO), .I0(A), .I1(B));
	//     {CO} = A B
endmodule

module RTLC_VMW_IBUF( Z, A);
output	Z ;
wire	Z ;
input	A ;
wire	A ;

	assign	Z = A;
endmodule

module RTLC_VMW_INV( Z, A);
output	Z ;
wire	Z ;
input	A ;
wire	A ;

	MED_LUT1_1 	rtlcgate_inst (.O(Z), .I0(A));
endmodule

module RTLC_VMW_MAJ3( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_E8	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A B + A C + B C
endmodule

module RTLC_VMW_MUX21L( Z, A, B, S, SN);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	S ;
wire	S ;
input	SN ;
wire	SN ;

	MED_LUT4_F53F	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(S), .I3(SN));
	//     {Z} = A' SN + B' SN' + S SN + S' SN'
endmodule

module RTLC_VMW_MUX2I( Z, A, B, S);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	S ;
wire	S ;

	MED_LUT3_35	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(S));
	//     {Z} = A' S' + B' S
endmodule

module RTLC_VMW_MUX2( Z, A, B, S);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	S ;
wire	S ;

wire	rtlcgate_4 ;
	MED_LUT3_CA	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(S));
	//     {Z} = A S' + B S
endmodule

module RTLC_VMW_MUX4( Z, A, B, D0, D1, D2, D3);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	D0 ;
wire	D0 ;
input	D1 ;
wire	D1 ;
input	D2 ;
wire	D2 ;
input	D3 ;
wire	D3 ;

wire	rtlcint_19;
	MED_LUT4_C840	rtlclut_inst (.O(rtlcint_19), .I0(A), .I1(B), .I2(D2), .I3(D3));
	//     [5076] = A B D3 + A' B D2
wire	rtlcint_20;
	MED_LUT4_3210	rtlclut_inst_0 (.O(rtlcint_20), .I0(A), .I1(B), .I2(D0), .I3(D1));
	//     [5073] = A B' D1 + A' B' D0
	MED_LUT2_E	rtlclut_inst_1 (.O(Z), .I0(rtlcint_19), .I1(rtlcint_20));
	//     {Z} = [5073] + [5076]
endmodule

module RTLC_VMW_NAND2( Z, A, B);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_7	rtlclut_inst (.O(Z), .I0(A), .I1(B));
	//     {Z} = A' + B'
endmodule

module RTLC_VMW_NAND3( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_7F	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A' + B' + C'
endmodule

module RTLC_VMW_NAND4( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_7FFF	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A' + B' + C' + D'
endmodule

module RTLC_VMW_NAND5( Z, A, B, C, D, E);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;

wire	rtlcint_6;
	MED_LUT2_8	rtlclut_inst (.O(rtlcint_6), .I0(A), .I1(B));
	//     [4798] = A B
	MED_LUT4_7FFF	rtlclut_inst_0 (.O(Z), .I0(C), .I1(D), .I2(E), .I3(rtlcint_6));
	//     {Z} = C' + D' + E' + [4798]'
endmodule

module RTLC_VMW_NOR2( Z, A, B);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_1	rtlclut_inst (.O(Z), .I0(A), .I1(B));
	//     {Z} = A' B'
endmodule

module RTLC_VMW_NOR3( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_01	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A' B' C'
endmodule

module RTLC_VMW_NOR4( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_0001	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A' B' C' D'
endmodule

module RTLC_VMW_NOR5( Z, A, B, C, D, E);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;

wire	rtlcint_6;
	MED_LUT3_01	rtlclut_inst (.O(rtlcint_6), .I0(A), .I1(B), .I2(C));
	//     [4847] = A' B' C'
	MED_LUT3_10	rtlclut_inst_0 (.O(Z), .I0(D), .I1(E), .I2(rtlcint_6));
	//     {Z} = D' E' [4847]
endmodule

module RTLC_VMW_OA31( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_FE00	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A D + B D + C D
endmodule

module RTLC_VMW_OAI211( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_1FFF	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A' B' + C' + D'
endmodule

module RTLC_VMW_OAI21( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_1F	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A' B' + C'
endmodule

module RTLC_VMW_OAI2222( Z, A, B, C, D, E, F, G, H);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;
input	F ;
wire	F ;
input	G ;
wire	G ;
input	H ;
wire	H ;

wire	rtlcint_9;
	MED_LUT2_1	rtlclut_inst (.O(rtlcint_9), .I0(C), .I1(D));
	//     [5096] = C' D'
wire	rtlcint_10;
	MED_LUT4_111F	rtlclut_inst_0 (.O(rtlcint_10), .I0(E), .I1(F), .I2(G), .I3(H));
	//     [5103] = E' F' + G' H'
	MED_LUT4_FFF1	rtlclut_inst_1 (.O(Z), .I0(A), .I1(B), .I2(rtlcint_9), .I3(rtlcint_10));
	//     {Z} = A' B' + [5096] + [5103]
endmodule

module RTLC_VMW_OAI22( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_111F	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A' B' + C' D'
endmodule

module RTLC_VMW_OBUF( Z, A);
output	Z ;
wire	Z ;
input	A ;
wire	A ;

	assign	Z = A;
endmodule

module RTLC_VMW_OR2( Z, A, B);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_E	rtlclut_inst (.O(Z), .I0(A), .I1(B));
	//     {Z} = A + B
endmodule

module RTLC_VMW_OR3( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_FE	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A + B + C
endmodule

module RTLC_VMW_OR4( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT4_FFFE	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
	//     {Z} = A + B + C + D
endmodule

module RTLC_VMW_OR5( Z, A, B, C, D, E);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;

wire	rtlcint_4;
	MED_LUT3_FE	rtlclut_inst (.O(rtlcint_4), .I0(A), .I1(B), .I2(C));
	//     [4823] = A + B + C
	MED_LUT3_FE	rtlclut_inst_0 (.O(Z), .I0(D), .I1(E), .I2(rtlcint_4));
	//     {Z} = D + E + [4823]
endmodule

module RTLC_VMW_XNOR2( Z, A, B);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_9	rtlclut_inst (.O(Z), .I0(A), .I1(B));
	//     {Z} = A B + A' B'
endmodule

module RTLC_VMW_XNOR3( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_69	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A B C' + A B' C + A' B C + A' B' C'
endmodule

module RTLC_VMW_XNOR4( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;

	MED_LUT1_1 	rtlcgate_n2 (.O(Z), .I0(rtlcs0));
    MED_LUT4_6996 rtlclut_inst (.O(rtlcs0), .I0(A), .I1(B), .I2(C), .I3(D));
endmodule

module RTLC_VMW_XNOR5( Z, A, B, C, D, E);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;

wire rtlcs0;
    MED_LUT1_1 	rtlcgate_n2 (.O(Z), .I0(rtlcs0));
	MED_LUT4_6996	rtlcm_0 (.O(rtlcmn0), .I0(in1), .I1(in2), .I2(in3), .I3(in4));
	MED_LUT2_6	rtlcm_1 (.O(rtlcs0), .I0(in5), .I1(rtlcmn0));

endmodule

module RTLC_VMW_XOR2( Z, A, B);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;

	MED_LUT2_6	rtlclut_inst (.O(Z), .I0(A), .I1(B));
	//     {Z} = A B' + A' B
endmodule

module RTLC_VMW_XOR3( Z, A, B, C);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;

	MED_LUT3_96	rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C));
	//     {Z} = A B C + A B' C' + A' B C' + A' B' C
endmodule

module RTLC_VMW_XOR4( Z, A, B, C, D);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
    MED_LUT4_6996 rtlclut_inst (.O(Z), .I0(A), .I1(B), .I2(C), .I3(D));
endmodule

module RTLC_VMW_XOR5( Z, A, B, C, D, E);
output	Z ;
wire	Z ;
input	A ;
wire	A ;
input	B ;
wire	B ;
input	C ;
wire	C ;
input	D ;
wire	D ;
input	E ;
wire	E ;
wire    rtlcmn0;

	MED_LUT4_6996	rtlcm_0 (.O(rtlcmn0), .I0(in1), .I1(in2), .I2(in3), .I3(in4));
	MED_LUT2_6	rtlcm_1 (.O(Z), .I0(in5), .I1(rtlcmn0));
endmodule


module RTLC_VMW_PULLUP (Z);
inout  Z;
    MED_PULLUP inst0 (.Z(Z));
endmodule



module RTLC_VMW_PULLDOWN (Z);
inout  Z;
    MED_PULLDOWN inst0(.Z(Z));
endmodule

module RTLC_VMW_KEEPER (Z);
inout Z;
    MED_KEEPER inst0(.Z(Z));
endmodule


module RTLC_VMW_BUFIZ (Z, E, A);
output  Z;  // was inout; changed to output for rtlc-vle
input  E, A;
   MED_BUFIZ inst0(.Z(Z), .E(E), .A(A)); 
endmodule


module RTLC_VMW_OBUFZ (Z, E, A);
inout  Z;
input  E, A;
    MED_OBUFZ inst0(.Z(Z), .E(E), .A(A));
endmodule


module RTLC_VMW_FD (Q, D, CP);
output Q;
input  D, CP;
    MED_FD inst0(.Q(Q), .D(D), .CP(CP));
endmodule

module RTLC_VMW_FDN (Q, D, CPN);
output Q;
input  D, CPN;
   MED_FDN inst0(.Q(Q), .D(D), .CPN(CPN)); 
endmodule

module RTLC_VMW_FDE(Q, D, CP, CE);
output Q;
input  D, CP, CE;
    MED_FDE inst0(.Q(Q), .D(D), .CP(CP), .CE(CE));
endmodule

module RTLC_VMW_FDP (Q, D, CP, PRE);
output Q;
input  D, CP, PRE;
   MED_FDP inst0(.Q(Q), .D(D), .CP(CP), .PRE(PRE)); 
endmodule

module RTLC_VMW_FDC (Q, D, CP, CLR);
output Q;
input  D, CP, CLR;
    MED_FDC inst0(.Q(Q), .D(D), .CP(CP), .CLR(CLR));
endmodule

module RTLC_VMW_FDPC (Q, D, CP, PRE, CLR);
output Q;
input  D, CP, PRE, CLR;
    MED_FDPC inst0(.Q(Q), .D(D), .CP(CP), .PRE(PRE), .CLR(CLR));
endmodule

module RTLC_VMW_FDPCE (Q, D, CP, PRE, CLR, CE);
output Q;
input  D, CP, PRE, CLR, CE;
    MED_FDPCE inst0(.Q(Q), .D(D), .CP(CP), .PRE(PRE), .CLR(CLR), .CE(CE));
endmodule

module RTLC_VMW_FDPC_INIT0(Q, D, CP, PRE, CLR);
output Q;
input  D, CP, PRE, CLR;
    MED_FDPC_INIT0 inst0(.Q(Q), .D(D), .CP(CP), .PRE(PRE), .CLR(CLR));
endmodule

module RTLC_VMW_FDPC_INIT1(Q, D, CP, PRE, CLR);
output Q;
input  D, CP, PRE, CLR;
    MED_FDPC_INIT1  inst0(.Q(Q), .D(D), .CP(Cp), .PRE(PRE), .CLR(CLR));
endmodule

module RTLC_VMW_FDPE (Q, D, CP, PRE, CE);
output Q;
input  D, CP, PRE, CE;
    MED_FDPE   inst0(.Q(Q), .D(D), .CP(CP), .PRE(PRE), .CE(CE));
endmodule

module RTLC_VMW_FDCE (Q, D, CP, CLR, CE);
output Q;
input  D, CP, CLR, CE;
    MED_FDCE inst0(.Q(Q), .D(D), .CP(CP), .CLR(CLR), .CE(CE));
endmodule

module RTLC_VMW_LD (Q, D, G);
output Q;
input  D, G;
    MED_LD inst0(.Q(Q), .D(D), .G(G));
endmodule

module RTLC_VMW_LDP (Q, D, G, PRE);
output Q;
input  D, G, PRE;
    MED_LDP inst0(.Q(Q), .D(D), .G(G), .PRE(PRE));
endmodule

module RTLC_VMW_LDC (Q, D, G, CLR);
output Q;
input  D, G, CLR;
    MED_LDC inst0(.Q(Q), .D(D), .G(G), .CLR(CLR));
endmodule

module RTLC_VMW_LDPC (Q, D, G, PRE, CLR);
output Q;
input  D, G, PRE, CLR;
    MED_LDPC inst0(.Q(Q), .D(D), .G(G), .PRE(PRE), .CLR(CLR));
endmodule

module RTLC_VMW_LDN (Q, D, GN);
output Q;
input  D, GN;
    MED_LDN inst0(.Q(Q), .D(D), .GN(GN));
endmodule

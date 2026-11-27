/*
module VMW_MUXF5 (O, I0, I1, S);
output O;
input  I0, I1, S;
VMW_MUX2 mux2 (.Z(O), .A(I0), .B(I1), .S(S));
endmodule

module VMW_MUXF6 (O, I0, I1, S);
output O;
input  I0, I1, S;
VMW_MUX2 mux2 (.Z(O), .A(I0), .B(I1), .S(S));
endmodule

module VMW_MUXCY(O,DI,CI,S);
output O;
input DI;
input CI;
input S;
VMW_MUX2 mux2 (.Z(O), .A(DI), .B(CI), .S(S));
endmodule//VMW_MUXCY

module VMW_MUXCY_L(LO,DI,CI,S);
output LO;
input CI;
input DI;
input S;
VMW_MUX2 mux2 (.Z(LO), .A(DI), .B(CI), .S(S));
endmodule//VMW_MUXCY_L

module VMW_XORCY(O,LI,CI);
output O;
input CI;
input LI;
VMW_XOR2 xor2 (.Z(O), .A(LI), .B(CI));
endmodule//VMW_XORCY

module VMW_MULT_AND(LO,I0,I1);
output LO;
input I0,I1;
VMW_AND2 and2 (.Z(LO), .A(I0), .B(I1));
endmodule //VMW_MULT_AND

module M_RTLSIM_MUXN_2_1(Z, in_1, in_0, sel_0);
output  Z;
wire    Z;
input   in_1;
wire    in_1;
input   in_0;
wire    in_0;
input   sel_0;
wire    sel_0;

    VMW_MUX2 inst1 (.Z(Z), .A(in_0), .B(in_1), .S(sel_0));
endmodule

module M_RTLSIM_AND_2(Z, in1, in2);
output	Z;
wire	Z;
input	in1;
wire	in1;
input	in2;
wire	in2;

	VMW_AND2	inst1 (.Z(Z ), .A(in1 ), .B(in2 ));
endmodule

module M_RTLSIM_OR_2(Z, in1, in2);
output	Z;
wire	Z;
input	in1;
wire	in1;
input	in2;
wire	in2;

	VMW_OR2	inst1 (.Z(Z ), .A(in1 ), .B(in2 ));
endmodule

module M_RTLSIM_XOR_2(Z, in1, in2);
output	Z;
wire	Z;
input	in1;
wire	in1;
input	in2;
wire	in2;

	VMW_XOR2	inst1 (.Z(Z ), .A(in1 ), .B(in2 ));
endmodule

module M_RTLSIM_AND_3(Z, in1, in2, in3);
output	Z;
wire	Z;
input	in1;
wire	in1;
input	in2;
wire	in2;
input	in3;
wire	in3;

	VMW_AND3	inst1 (.Z(Z ), .A(in1 ), .B(in2 ), .C(in3 ));
endmodule

module M_RTLSIM_OR_3(Z, in1, in2, in3);
output	Z;
wire	Z;
input	in1;
wire	in1;
input	in2;
wire	in2;
input	in3;
wire	in3;

	VMW_OR3	inst1 (.Z(Z ), .A(in1 ), .B(in2 ), .C(in3 ));
endmodule

module M_RTLSIM_XOR_3(Z, in1, in2, in3);
output	Z;
wire	Z;
input	in1;
wire	in1;
input	in2;
wire	in2;
input	in3;
wire	in3;

	VMW_XOR3	inst1 (.Z(Z ), .A(in1 ), .B(in2 ), .C(in3 ));
endmodule

*/

module VMW_RTL_BUF16(Z, A);
  output [15:0] Z;
  wire [15:0] Z;
  input [15:0]  A;
  wire [15:0] A;

   VMW_BUF inst0 (.Z(Z[0]), .A(A[0]));
   VMW_BUF inst1 (.Z(Z[1]), .A(A[1]));
   VMW_BUF inst2 (.Z(Z[2]), .A(A[2]));
   VMW_BUF inst3 (.Z(Z[3]), .A(A[3]));
   VMW_BUF inst4 (.Z(Z[4]), .A(A[4]));
   VMW_BUF inst5 (.Z(Z[5]), .A(A[5]));
   VMW_BUF inst6 (.Z(Z[6]), .A(A[6]));
   VMW_BUF inst7 (.Z(Z[7]), .A(A[7]));
   VMW_BUF inst8 (.Z(Z[8]), .A(A[8]));
   VMW_BUF inst9 (.Z(Z[9]), .A(A[9]));
   VMW_BUF inst10 (.Z(Z[10]), .A(A[10]));
   VMW_BUF inst11 (.Z(Z[11]), .A(A[11]));
   VMW_BUF inst12 (.Z(Z[12]), .A(A[12]));
   VMW_BUF inst13 (.Z(Z[13]), .A(A[13]));
   VMW_BUF inst14 (.Z(Z[14]), .A(A[14]));
   VMW_BUF inst15 (.Z(Z[15]), .A(A[15]));

endmodule // VMW_RTL_BUF16

module VMW_RTL_FD16(Q, D, CP);
  output [15:0] Q;
  input [15:0]  D;
  input         CP;

  VMW_FD rtlcI9 (.Q(Q[0]), .D(D[0]), .CP(CP));
  VMW_FD rtlcI10 (.Q(Q[1]), .D(D[1]), .CP(CP));
  VMW_FD rtlcI11 (.Q(Q[2]), .D(D[2]), .CP(CP));
  VMW_FD rtlcI12 (.Q(Q[3]), .D(D[3]), .CP(CP));
  VMW_FD rtlcI13 (.Q(Q[4]), .D(D[4]), .CP(CP));
  VMW_FD rtlcI14 (.Q(Q[5]), .D(D[5]), .CP(CP));
  VMW_FD rtlcI15 (.Q(Q[6]), .D(D[6]), .CP(CP));
  VMW_FD rtlcI16 (.Q(Q[7]), .D(D[7]), .CP(CP));
  VMW_FD rtlcI17 (.Q(Q[8]), .D(D[8]), .CP(CP));
  VMW_FD rtlcI18 (.Q(Q[9]), .D(D[9]), .CP(CP));
  VMW_FD rtlcI19 (.Q(Q[10]), .D(D[10]), .CP(CP));
  VMW_FD rtlcI20 (.Q(Q[11]), .D(D[11]), .CP(CP));
  VMW_FD rtlcI21 (.Q(Q[12]), .D(D[12]), .CP(CP));
  VMW_FD rtlcI22 (.Q(Q[13]), .D(D[13]), .CP(CP));
  VMW_FD rtlcI23 (.Q(Q[14]), .D(D[14]), .CP(CP));
  VMW_FD rtlcI24 (.Q(Q[15]), .D(D[15]), .CP(CP));
endmodule // VMW_RTL_FD16
 
module VMW_FD2(Q, QN, D, CP);
  output  Q;
  wire    Q;
  output  QN;
  wire    QN;
  input   D;
  wire    D;
  input   CP;
  wire    Cp;

  VMW_FD  inst_fd  (.Q(Q), .D(D), .CP(CP));
  VMW_INV inst_inv (.Z(QN), .A(Q));


endmodule // VMW_FD2

module VMW_FDP2(Q, QN, D, CP, S);
  output  Q;
  wire    Q;
  output  QN;
  wire    QN;
  input   D;
  wire    D;
  input   CP;
  wire    CP;
  input   S;
  wire    S;

  VMW_FDP inst_fdp  (.Q(Q), .D(D), .CP(CP), .PRE(S));
  VMW_INV inst_inv (.Z(QN), .A(Q));
                                                                                
                                                                                
endmodule //VMW_FDP2

module VMW_LD2(Q, QN, D, G);
    output Q,QN;
    input D, G;
    VMW_LD  g1 (.Q(Q), .D(D), .G(G));
    VMW_INV g2 (.Z(QN), .A(Q));
endmodule// VMW_LD2


macromodule VMW_LDN2(Q, QN, D, GN);
    output Q, QN;
    input D, GN;

    VMW_LDN g1 (.Q(Q), .D(D), .GN(GN));
    VMW_INV g2 (.Z(QN), .A(Q));

endmodule   // VMW_LDN2


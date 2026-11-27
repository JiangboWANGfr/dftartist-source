/////////////////////////////////////////////////////////////////////
// Start of library med.rtlc.v
//
// IKOS RTLC-specific MED reference library primitive prototypes
//
// Supported Specs
//
// 1. The following specparams have been added:
//    AREA        (the area cost of the cell)
//    FFCOUNT     (the number of flip-flops in the cell)
//    LATCH       (the number of latches in the cell)
//    SEQ         (the sequential property of the cell)
//    PRIM_FUNC   (the equivalent rtlc unmapped primitive)
//    PRIM_FUNCT  (the equivalent rtlc primitive function)
//    PRIM_PORT_* (the equivalent rtlc primitive ports)
//    PRIM_CP     (the clock port of the cell)
//    PRIM_SET    (the async set/preset port of the cell)
//    PRIM_S_SET  (the sync set/preset port of the cell)
//    PRIM_RESET  (the async reset/clear port of the cell)
//    PRIM_S_RESET(the sync reset/clear port of the cell)
/////////////////////////////////////////////////////////////////////


// Buffer

macromodule MED_BUF (Z, A);
  //  function : "A";
  output Z;
  input  A;
  specify
    specparam PRIM_FUNC = "RTL_BUF";
    specparam PRIM_FUNCT = "PRIM_BUF";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "A";
    specparam AREA = 0;
  endspecify
endmodule

//TIP_BIGATER
/*macromodule TIP_BIGATER (O, OE, BI);
  // function : "BI";
  output O, OE;
  inout BI;
  specify
    specparam AREA = 0;
  endspecify
endmodule*/

//TIP_DRIVEGATE
/*macromodule TIP_DRIVEGATE (Z, A);
  inout Z;
  input A;
  specify
    specparam AREA = 0;
  endspecify
endmodule*/

// Inverter
macromodule MED_INV (Z,A);
  //  function : "A'"
  output Z;
  input  A;
  specify
    specparam PRIM_FUNC = "RTL_NOT";
    specparam PRIM_FUNCT = "PRIM_INV";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "A";
    specparam AREA = 0;
  endspecify
endmodule


// And Gates

macromodule MED_AND2 (Z, A, B);
  //  function : "(AB)";
  output Z;
  input  A,B;
  specify
    specparam PRIM_FUNC = "RTL_AND";
    specparam PRIM_FUNCT = "PRIM_AND";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "in1";
    specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
  endspecify
endmodule

macromodule MED_AND3 (Z, A, B, C);
  //  function : "(ABC)";
  output Z;
  input  A,B,C;
  specify
    specparam PRIM_FUNCT = "PRIM_AND";
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_AND4 (Z,A,B,C,D);
  //  function : "(ABCD)";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_FUNCT = "PRIM_AND";
  endspecify
endmodule

macromodule MED_AND5 (Z,A,B,C,D,E);
  //  function : "(ABCDE)";
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 6;
    specparam PRIM_FUNCT = "PRIM_AND";
  endspecify
endmodule


// Nand Gates

macromodule MED_NAND2 (Z, A, B);
  //  function : "(AB)'"
  output Z;
  input  A,B;
  specify
    specparam PRIM_FUNC = "RTL_NAND";
    specparam PRIM_FUNCT = "PRIM_NAND";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "in1";
    specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
  endspecify
endmodule

macromodule MED_NAND3 (Z, A,B,C);
  //  function : "(ABC)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_NAND4 (Z,A,B,C,D);
  //  function : "(ABCD)'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
  endspecify
endmodule

macromodule MED_NAND5 (Z,A,B,C,D,E);
  //  function : "(ABCDE)'";
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 6;
  endspecify
endmodule


// Or Gates

macromodule MED_OR2 (Z, A, B);
  //  function : "(A+B)";
  output Z;
  input  A,B;
  specify
    specparam PRIM_FUNC = "RTL_OR";
    specparam PRIM_FUNCT = "PRIM_OR";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "in1";
    specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
  endspecify
endmodule

macromodule MED_OR3 (Z,A,B,C);
  //  function : "(A+B+C)";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_FUNCT = "PRIM_OR";
  endspecify
endmodule

macromodule MED_OR4 (Z,A,B,C,D);
  //  function : "(A+B+C+D)";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_FUNCT = "PRIM_OR";
  endspecify
endmodule

macromodule MED_OR5 (Z,A,B,C,D,E);
  //  function : "(A+B+C+D+E)";
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 6;
    specparam PRIM_FUNCT = "PRIM_OR";
  endspecify
endmodule


// Nor Gates

macromodule MED_NOR2 (Z, A, B);
  //  function : "(A+B)'";
  output Z;
  input  A,B;
  specify
    specparam PRIM_FUNC = "RTL_NOR";
    specparam PRIM_FUNCT = "PRIM_NOR";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "in1";
    specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
  endspecify

endmodule

macromodule MED_NOR3 (Z,A,B,C);
  //  function : "(A+B+C)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_NOR4 (Z,A,B,C,D);
  //  function : "(A+B+C+D)'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
  endspecify
endmodule

macromodule MED_NOR5 (Z, A, B, C, D, E);
  //  function : "(A+B+C+D+E)'";
  output Z;
  input  A, B, C, D, E;
  specify
    specparam AREA = 6;
  endspecify
endmodule


// Xor Gates

macromodule MED_XOR2 (Z, A, B);
  //  function : "(AB'+ A'B)";
  output Z;
  input  A,B;
  specify
    specparam PRIM_FUNC = "RTL_XOR";
    specparam PRIM_FUNCT = "PRIM_XOR";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "in1";
    specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
  endspecify
endmodule

macromodule MED_XOR3( Z, A,B,C);
  //  function : "(A'B'C+A'B C'+A B'C'+A B C)";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_FUNCT = "PRIM_XOR";
  endspecify
endmodule

macromodule MED_XOR4 (Z, A, B, C, D);
  //  function : "((A B)+((C+D)'))'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_FUNCT = "PRIM_XOR";
  endspecify
  wire t1, t2;
  VMW_XOR2 U1 (.Z(t1), .A(A), .B(B));
  VMW_XOR2 U2 (.Z(t2), .A(C), .B(D));
  VMW_XOR2 U3 (.Z(Z), .A(t1), .B(t2));
endmodule


macromodule MED_XOR5 (Z, A, B, C, D, E);
  //  function : ((A B)+((C+D)'))' E + ((A B)+((C+D)')) E'
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 7;
    specparam PRIM_FUNCT = "PRIM_XOR";
  endspecify
  wire t1, t2,t3;
  VMW_XOR2 U1 (.Z(t1), .A(A),  .B(B));
  VMW_XOR2 U2 (.Z(t2), .A(C),  .B(D));
  VMW_XOR2 U3 (.Z(t3), .A(t1), .B(E));
  VMW_XOR2 U4 (.Z(Z), .A(t3),  .B(t2));
endmodule

// Xnor Gates

macromodule MED_XNOR2 (Z, A, B);
  //  function : "(AB+A'B')";
  output Z;
  input  A,B;
  specify
    specparam PRIM_FUNC = "RTL_XNOR";
    specparam PRIM_FUNCT = "PRIM_XNOR";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "in1";
    specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
  endspecify
endmodule

macromodule MED_XNOR3( Z, A,B,C);
  //  function : "(A'B'C'+A'B C+A B'C+A B C')";
  output Z;
  input  A, B, C;
  specify
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_XNOR4 (Z, A, B, C, D);
  //  function : "((A+B)((C D)'))'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
  endspecify  
  wire t1, t2;
  VMW_XNOR2 U1 (.Z(t1), .A(A), .B(B));
  VMW_XNOR2 U2 (.Z(t2), .A(C), .B(D));
  VMW_XNOR2 U3 (.Z(Z), .A(t1), .B(t2));
endmodule

macromodule MED_XNOR5 (Z, A, B, C, D,E);
  //  function: xnor (z,a,b,c,d,e)
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 7;
  endspecify  
  wire t1, t2;
  VMW_XOR2 U1 (.Z(t1), .A(A), .B(B));
  VMW_XOR2 U2 (.Z(t2), .A(C), .B(D));
  VMW_XOR2 U3 (.Z(t3), .A(t1), .B(E));
  VMW_XNOR2 U4 (.Z(Z), .A(t2), .B(t3));
endmodule



// And-Ors

macromodule MED_AO21 (Z, A, B, C);
  //  function : "((A B)+C)";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_AO211 (Z, A, B, C, D);
  //  function : "((A B)+C+D)";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 4;
  endspecify
endmodule

macromodule MED_AO22 (Z, A, B, C, D);
  //  function : "(A B+C D)";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
  endspecify
endmodule

macromodule MED_AO222 (Z, A, B, C, D, E,F);
  //  function : "(A B+C D+E F)";
  output Z;
  input  A, B, C, D, E, F;
  specify
    specparam AREA = 6;
  endspecify
endmodule


// And-Or Inverts

macromodule MED_AOI21 (Z, A, B, C);
  //  function : "((A B)+C)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_AOI211 (Z, A, B, C, D);
  //  function : "((A B)+C+D)'";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
  endspecify
endmodule

macromodule MED_AOI22 (Z, A, B, C, D);
  //  function : "(A B+C D)'";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
  endspecify
endmodule

module MED_AOI222 (Z, A, B, C, D, E,F);
  //  function : "(A B+C D+E F)'";
  output Z;
  input  A, B, C, D, E, F;
  specify
    specparam AREA = 7;
  endspecify
endmodule


// Or-And

macromodule MED_OA31 (Z, A, B, C, D);
  //  function : "((A+B+C)D)";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 4;
  endspecify
endmodule


// Or-And Inverts

macromodule MED_OAI21 (Z, A, B, C);
  //  function : "((A+B)C)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_OAI211 (Z, A, B, C, D);
  //  function : "((A+B)C D)'";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
  endspecify
endmodule

macromodule MED_OAI22 (Z, A, B, C, D);
  //  function : "((A+B)(C+D))'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
  endspecify
endmodule

macromodule MED_OAI2222 (Z, A, B, C, D, E, F, G, H);
  //  function : "((A+B)(C+D)(E+F)(G+H))'";
  output Z;
  input  A, B, C, D, E, F, G, H;
  specify
    specparam AREA = 9;
  endspecify
endmodule


// 3-input majority gate

macromodule MED_MAJ3 (Z, A, B, C);
  // function: "((AB)+(AC)+(BC))"
  output Z;
  input  A, B, C;
  specify
    specparam AREA = 3;
  endspecify
endmodule


// Multiplexors

macromodule MED_MUX2 (Z, A, B, S);
  //  function : "(S'A+S B)";
  output Z;
  input  A, B, S;
  specify
    specparam PRIM_FUNC = "RTL_MUX2";
    specparam PRIM_FUNCT = "PRIM_MUX";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_A = "in0";
    specparam PRIM_PORT_B = "in1";
    specparam PRIM_PORT_S = "sel";
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_MUX2I (Z, A, B, S);
  //  function : "(S'A'+S B')";
  output Z;
  input  A, B, S;
  specify
    specparam AREA = 3;
  endspecify
endmodule

macromodule MED_MUX21L (Z, A, B, S, SN);
  //  function : "( (A S' SN) + (B S SN') )'";
  output Z;
  input  A, B, S, SN;
  specify
    specparam AREA = 5;
  endspecify
endmodule

macromodule MED_MUX4 ( Z, A, B, D0, D1, D2, D3);
  //  function : "((D0 A'B')+(D1 A B')+(D2 A'B)+(D3 A B))";
  output Z;
  input  A, B, D0, D1, D2, D3;
  specify
    specparam AREA = 7;
  endspecify
endmodule

macromodule MED_DEC24L (Z0, Z1, Z2, Z3, A, B);
  //  pin(Z0)  function : "A B' + A' B + A B";
  //  pin(Z1)  function : "A' B' + A' B + A B";
  //  pin(Z2)  function : "A' B' + A B' + A B";
  //  pin(Z3)  function : "A' B' + A B' + A' B";
  output Z0, Z1, Z2, Z3;
  input  A, B;
  specify
    specparam AREA = 6;
  endspecify
  wire AI, BI;
  VMW_INV  U1 (.Z(AI), .A(A));
  VMW_INV  U2 (.Z(BI), .A(B));
  VMW_OR2 U3 (.Z(Z0), .A(A), .B(B));
  VMW_OR2 U4 (.Z(Z1), .A(AI), .B(B));
  VMW_OR2 U5 (.Z(Z2), .A(A), .B(BI));
  VMW_OR2 U6 (.Z(Z3), .A(AI), .B(BI));
endmodule


// Adders

module MED_FADD ( S, CO, CI, A, B);
  //  pin(S)   function : "CI A' B' + CI' A B' + CI' A' B + CI A B";
  //  pin(CO)  function : "CI A B' + CI A' B + CI' A B + CI A B";
  output S, CO;
  input  CI, A, B;
  specify
    specparam AREA = 6;
  endspecify
  VMW_XOR3 U1 (.Z(S), .A(A), .B(B), .C(CI));
  VMW_AO222 U2(.Z(CO), .A(A), .B(B), .C(B), .D(CI), .E(CI), .F(A));
endmodule

macromodule MED_HADD (S, CO, A, B);
  //  pin(S)   function : "A' B +  A B'";
  //  pin(CO)  function : "A B";
  output S, CO;
  input  A, B;
  specify
    specparam AREA = 4;
  endspecify
  VMW_XOR2 U1 (.Z(S), .A(A), .B(B));
  VMW_AND2 U2 (.Z(CO), .A(A), .B(B));
endmodule


// Flip-flops

// D-flop
macromodule MED_FD (Q, D, CP);
  output Q;
  input  D, CP;
  specify
    specparam PRIM_FUNC = "RTL_DFF";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

module MED_FD2 (Q, QN, D, CP);
  output Q, QN;
  input  D, CP;
  specify
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with clock enable
macromodule MED_FDE (Q, D, CP, CE);
  output Q;
  input  D, CP, CE;
  specify
    specparam PRIM_FUNC = "RTL_DFFE";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with enable & async preset & clear
macromodule MED_FDPCE (Q, D, CP, PRE, CLR, CE);
  output Q;
  input  D, CP, PRE, CLR, CE;
  specify
    specparam PRIM_FUNC = "RTL_DFFECP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Negative-edge D-flop
macromodule MED_FDN (Q, D, CPN);
  output Q;
  input  D, CPN;
  specify
    specparam PRIM_FUNC = "RTL_DFFN";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CPN";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CPN = "clk";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with async preset
macromodule MED_FDP (Q, D, CP, PRE);
  output Q;
  input  D, CP, PRE;
  specify
    specparam PRIM_FUNC = "RTL_DFFP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with async preset & clear
macromodule MED_FDPC (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    specparam PRIM_FUNC = "RTL_DFFCP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with async preset & clear, initialized to 0
macromodule MED_FDPC_INIT0 (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    specparam PRIM_FUNC = "RTL_POR";
    specparam PRIM_FUNCT = "PRIM_POR";
    specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with async preset & clear, initialized to 1
macromodule MED_FDPC_INIT1 (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    specparam PRIM_FUNC = "RTL_POP";
    specparam PRIM_FUNCT = "PRIM_POP";
    specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with async preset with Qbar
macromodule MED_FDP2 (Q, QN, D, CP, S);
  output Q, QN;
  input  D, CP, S;
  specify
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with clock enable, async preset
macromodule MED_FDPE (Q, D, CP, PRE, CE);
  output Q;
  input  D, CP, PRE, CE;
  specify
	specparam PRIM_FUNC = "RTL_DFFEP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with async clear
macromodule MED_FDC (Q, D, CP, CLR);
  output Q;
  input  D, CP, CLR;
  specify
    specparam PRIM_FUNC = "RTL_DFFC";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with clock enable, async clear
macromodule MED_FDCE (Q, D, CP, CLR, CE);
  output Q;
  input  D, CP, CLR, CE;
  specify
    specparam PRIM_FUNC = "RTL_DFFEC";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CLR = "clear";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Synchronous Filp Flops

// D-flop with enable , sync preset & clear
macromodule MED_FDSPCE (Q, D, CP, PRE, CLR, CE);
  output Q;
  input  D, CP, PRE, CLR, CE;
  specify
    specparam PRIM_FUNC = "RTL_DFFESCP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    specparam PRIM_S_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with enable , sync preset 
macromodule MED_FDSPE (Q, D, CP, PRE, CE);
  output Q;
  input  D, CP, PRE, CE;
  specify
    specparam PRIM_FUNC = "RTL_DFFESP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with enable sync clear
macromodule MED_FDSCE (Q, D, CP, CLR, CE);
  output Q;
  input  D, CP, CLR, CE;
  specify
    specparam PRIM_FUNC = "RTL_DFFESC";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_S_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CLR = "clear";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with sync preset & clear
macromodule MED_FDSPC (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    specparam PRIM_FUNC = "RTL_DFFSCP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    specparam PRIM_S_RESET = "CLR";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with sync preset 
macromodule MED_FDSP (Q, D, CP, PRE);
  output Q;
  input  D, CP, PRE;
  specify
    specparam PRIM_FUNC = "RTL_DFFSP";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// D-flop with sync  clear
macromodule MED_FDSC (Q, D, CP, CLR);
  output Q;
  input  D, CP, CLR;
  specify
    specparam PRIM_FUNC = "RTL_DFFSC";
    specparam PRIM_FUNCT = "PRIM_FF";
    specparam PRIM_CP = "CP";
    specparam PRIM_S_RESET = "CLR";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "D";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual Edge Flip-flops

// Dual Edge D-flop
macromodule MED_DDFF (Q, DH, DL, CP);
  output Q;
  input  DH, DL, CP;
  specify
    specparam PRIM_FUNC = "RTL_DDFF";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule MED_DDFFE (Q, DH, DL, CP, CE);
  output Q;
  input  DH, DL, CP, CE;
  specify
    specparam PRIM_FUNC = "RTL_DDFFE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule MED_DDFFP (Q, DH, DL, CP, PRE);
  output Q;
  input  DH, DL, CP, PRE;
  specify
    specparam PRIM_FUNC = "RTL_DDFFP";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule MED_DDFFC (Q, DH, DL, CP, CLR);
  output Q;
  input  DH, DL, CP, CLR;
  specify
    specparam PRIM_FUNC = "RTL_DDFFC";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

//Creating two dummy DualEdge Flip Flop with two Enables
//This Flip Flop will never be in the final netlist
//It will be converted to MED_DDFFE or MED_DDFF in nomFFOpt

macromodule MED_DDFFDE(Q, DH, DL, CP, CE, CE1);
  output Q;
  input  DH, DL, CP, CE, CE1;
  specify
    specparam PRIM_FUNC = "RTL_DDFFDE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_ENABLE_D = "CE1";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CE = "enable";
    specparam PRIM_PORT_CE1 = "enable1";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

macromodule MED_DDFFPCDE(Q, DH, DL, CP, PRE, CLR, CE, CE1);
  output Q;
  input  DH, DL, CP, PRE, CLR, CE, CE1;
  specify
    specparam PRIM_FUNC = "RTL_DDFFPCDE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_ENABLE_D = "CE1";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam PRIM_PORT_CE = "enable";
    specparam PRIM_PORT_CE1 = "enable1";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

macromodule MED_DDFFPC (Q, DH, DL, CP, PRE, CLR);
  output Q;
  input  DH, DL, CP, PRE, CLR;
  specify
    specparam PRIM_FUNC = "RTL_DDFFPC";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule MED_DDFFPCE (Q, DH, DL, CP, PRE, CLR, CE);
  output Q;
  input  DH, DL, CP, PRE, CLR, CE;
  specify
    specparam PRIM_FUNC = "RTL_DDFFPCE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CLR = "clear";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule MED_DDFFPE (Q, DH, DL, CP, PRE, CE);
   output Q;
   input  DH, DL, CP, PRE, CE;
   specify
    specparam PRIM_FUNC = "RTL_DDFFPE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_PRE = "preset";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule MED_DDFFCE (Q, DH, DL, CP, CLR, CE);
   output Q;
   input  DH, DL, CP, CLR, CE;
   specify
    specparam PRIM_FUNC = "RTL_DDFFCE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_DH = "DH";
    specparam PRIM_PORT_DL = "DL";
    specparam PRIM_PORT_CP = "clk";
    specparam PRIM_PORT_CLR = "clear";
    specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
  endspecify
endmodule

// Dual-clocked flop with two inputs, preset and clear
//  at rising edge of CK1, flop latches D1
//  at rising edge of CK1, flop latches D2
//  behavior is undefined for simultaneous rise in CK1 and CK2
module MED_MC2_FDPC(Q, D1, CP1, D2, CP2, PRE, CLR);
  output Q;
  input  D1, CP1, D2, CP2, PRE, CLR;
  specify
    specparam AREA = 28;
    specparam FFCOUNT = 2;
    specparam SEQ = 1;
  endspecify
endmodule


// Latches

// Positive-enable
macromodule MED_LD (Q, D, G);
  output Q;
  input  D, G;
  specify
    specparam PRIM_FUNC = "RTL_LATCH"; // active-high enable
    specparam PRIM_FUNCT = "PRIM_LD";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "A";
    specparam PRIM_PORT_G = "E";
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule

macromodule MED_LDP (Q, D, G, PRE);
  output Q;
  input  D, G, PRE;
  specify
    specparam PRIM_FUNC = "RTL_LATCH_P";
    specparam PRIM_FUNCT = "PRIM_LD";
    specparam PRIM_SET = "PRE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "A";
    specparam PRIM_PORT_G = "E";
    specparam PRIM_PORT_PRE = "P";
    specparam AREA = 8;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule

macromodule MED_LDC (Q, D, G, CLR);
  output Q;
  input  D, G, CLR;
  specify
    specparam PRIM_FUNC = "RTL_LATCH_C";
    specparam PRIM_FUNCT = "PRIM_LD";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "A";
    specparam PRIM_PORT_G = "E";
    specparam PRIM_PORT_CLR = "C";
    specparam AREA = 8;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule

macromodule MED_LDPC (Q, D, G, PRE, CLR);
  output Q;
  input  D, G, PRE, CLR;
  specify
    specparam PRIM_FUNC = "RTL_LATCH_PC";
    specparam PRIM_FUNCT = "PRIM_LDPC";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "A";
    specparam PRIM_PORT_G = "E";
    specparam PRIM_PORT_PRE = "P"; 
    specparam PRIM_PORT_CLR = "C";
    specparam AREA = 8;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule

// Negative-enable
macromodule MED_LDN (Q, D, GN);
  output Q;
  input  D, GN;
  specify
    specparam PRIM_FUNC = "RTL_LATCHN"; // active-low enable
    specparam PRIM_FUNCT = "PRIM_LDN";
    specparam PRIM_PORT_Q = "Z";
    specparam PRIM_PORT_D = "A";
    specparam PRIM_PORT_GN = "E";
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule

macromodule MED_LD2 (Q, QN, D, G);
  output Q, QN;
  input  D, G;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule

macromodule MED_LDN2 (Q, QN, D, GN);
  output Q, QN;
  input  D, GN;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule

macromodule MED_LD2G (Q, D0, G0, D1, G1);
  output Q;
  input  D0, G0, D1, G1;
  specify
    specparam AREA = 7;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule


// Pads

// Internal tristate driver
macromodule MED_BUFIZ (Z, E, A);
  output  Z;  // was inout; changed to output for rtlc-vle
  input  E, A;
  specify
    specparam PRIM_FUNC = "RTL_TRI";
    specparam PRIM_FUNCT = "PRIM_TRI";
    specparam PRIM_PORT_Z = "Z";
    specparam PRIM_PORT_E = "enable";
    specparam PRIM_PORT_A = "A";
    specparam AREA = 3;
    specparam SEQ = 1;
    specparam TRISB = 1;
  endspecify
endmodule

// Tristateable output pad
macromodule MED_OBUFZ (Z, E, A);
  inout  Z;
  input  E, A;
  specify
    specparam AREA = 3;
    specparam SEQ = 1;
    specparam TRISB = 1;
  endspecify
endmodule

// Input pad
macromodule MED_IBUF (Z, A);
  output Z;
  input  A;
  specify
    specparam AREA = 0;
  endspecify
endmodule

// Output pad
macromodule MED_OBUF (Z, A);
  output Z;
  input  A;
  specify
    specparam AREA = 0;
  endspecify
endmodule


// Pullup/pulldown: can be used on pads, internal tristate busses,
// and undriven nets to set default behavior

macromodule MED_PULLUP (Z);
  inout  Z;
  specify
    specparam PRIM_FUNC = "RTL_PULLUP";
    specparam PRIM_FUNCT = "PRIM_PULLUP";
    specparam PRIM_PORT_Z = "Z";
    specparam AREA = 1;
  endspecify
endmodule

macromodule MED_PULLDOWN (Z);
  inout  Z;
  specify
    specparam PRIM_FUNC = "RTL_PULLDOWN";
    specparam PRIM_FUNCT = "PRIM_PULLDOWN";
    specparam PRIM_PORT_Z = "Z";
    specparam AREA = 1;
  endspecify
endmodule


// Internal tristate bus state preserver

macromodule MED_KEEPER (Z);
  inout  Z;
  specify
    specparam PRIM_FUNC = "RTL_KEEPER";
    specparam PRIM_FUNCT = "PRIM_KEEPER";
    specparam PRIM_PORT_Z = "Z";
    specparam AREA = 1;
  endspecify
endmodule


macromodule MED_DGATE (Q, D, A);
  output Q;
  input  D, A;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule // MED_DGATE

// This is same as the MED_DGATE above
macromodule TIP_DGATE (Q, D, A);
  output Q;
  input  D, A;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule // TIP_DGATE

*/macromodule TIP_BIGATE(O, OE, I, IS, BI);
  output O, OE;
  input  I, IS;
  inout  BI;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
  endspecify
endmodule // TIP_BIGATE


module MED_RTL_BUF16(Z, A);
  output [15:0] Z;
  input [15:0]  A;
  specify
    specparam AREA = 0;
  endspecify
endmodule // MED_RTL_BUF16


module MED_RTL_FD16(Q, D, CP);
  output [15:0] Q;
  input [15:0]  D;
  input         CP;
  specify
    specparam AREA = 64;
    specparam FFCOUNT = 16;
    specparam SEQ = 1;
  endspecify
endmodule // MED_RTL_FD16
*/
/* Start VMW primitives, so that they are mapped */


// 1. The following specparams have been added:
//    AREA        (the area cost of the cell)
//    FFCOUNT     (the number of flip-flops in the cell)
//    LATCH       (the number of latches in the cell)
//    SEQ         (the sequential property of the cell)
//    PRIM_FUNC   (the equivalent rtlc unmapped primitive)
//    PRIM_FUNCT  (the equivalent rtlc primitive function)
//    PRIM_PORT_* (the equivalent rtlc primitive ports)
//    PRIM_CP     (the clock port of the cell)
//    PRIM_SET    (the async set/preset port of the cell)
//    PRIM_S_SET  (the sync set/preset port of the cell)
//    PRIM_RESET  (the async reset/clear port of the cell)
//    PRIM_S_RESET(the sync reset/clear port of the cell)
//
//    PRIM_EQUIV  (the equivalent Primitive, to which the this may be mapped)
//    PORT_MAP    (mapping of ports, in case PRIM_EQIV is specified)

// Buffer

macromodule VMW_BUF (Z, A);
  //  function : "A";
  output Z;
  input  A;
  specify
    //specparam PRIM_FUNC = "RTL_BUF";
    specparam PRIM_FUNCT = "PRIM_BUF";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "A";
    specparam AREA = 0;
    specparam PRIM_EQUIV = "MED_BUF";
  endspecify
endmodule

macromodule VMW_CDFB(Z, A);
   output Z;
   input A;
   specify
    specparam AREA = 0;
    specparam PRIM_EQUIV = "MED_BUF";
    specparam MED_EQUIV= "MED_CDFB";
  endspecify
   
endmodule

macromodule MED_CDFB(Z, A);
   output Z;
   input A;
   specify
    specparam AREA = 0;
  endspecify
endmodule

// Inverter

macromodule VMW_INV (Z,A);
  //  function : "A'"
  output Z;
  input  A;
  specify
    //specparam PRIM_FUNC = "RTL_NOT";
    specparam PRIM_FUNCT = "PRIM_INV";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "A";
    specparam AREA = 0;
    specparam PRIM_EQUIV = "MED_INV";
  endspecify
endmodule


// And Gates

macromodule VMW_AND2 (Z, A, B);
  //  function : "(AB)";
  output Z;
  input  A,B;
  specify
    //specparam PRIM_FUNC = "RTL_AND";
    specparam PRIM_FUNCT = "PRIM_AND";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "in1";
    //specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
    specparam PRIM_EQUIV = "MED_AND2";
  endspecify
endmodule

macromodule VMW_AND3 (Z, A, B, C);
  //  function : "(ABC)";
  output Z;
  input  A,B,C;
  specify
    specparam PRIM_FUNCT = "PRIM_AND";
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_AND3";
  endspecify
endmodule

macromodule VMW_AND4 (Z,A,B,C,D);
  //  function : "(ABCD)";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_FUNCT = "PRIM_AND";
    specparam PRIM_EQUIV = "MED_AND4";
  endspecify
endmodule

macromodule VMW_AND5 (Z,A,B,C,D,E);
  //  function : "(ABCDE)";
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 6;
    specparam PRIM_FUNCT = "PRIM_AND";
    specparam PRIM_EQUIV = "MED_AND5";
  endspecify
endmodule


// Nand Gates

macromodule VMW_NAND2 (Z, A, B);
  //  function : "(AB)'"
  output Z;
  input  A,B;
  specify
    //specparam PRIM_FUNC = "RTL_NAND";
    specparam PRIM_FUNCT = "PRIM_NAND";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "in1";
    //specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
    specparam PRIM_EQUIV = "MED_NAND2";
  endspecify
endmodule

macromodule VMW_NAND3 (Z, A,B,C);
  //  function : "(ABC)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_NAND3";
  endspecify
endmodule

macromodule VMW_NAND4 (Z,A,B,C,D);
  //  function : "(ABCD)'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_NAND4";
  endspecify
endmodule

macromodule VMW_NAND5 (Z,A,B,C,D,E);
  //  function : "(ABCDE)'";
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 6;
    specparam PRIM_EQUIV = "MED_NAND5";
  endspecify
endmodule


// Or Gates

macromodule VMW_OR2 (Z, A, B);
  //  function : "(A+B)";
  output Z;
  input  A,B;
  specify
    //specparam PRIM_FUNC = "RTL_OR";
    specparam PRIM_FUNCT = "PRIM_OR";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "in1";
    //specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
    specparam PRIM_EQUIV = "MED_OR2";
  endspecify
endmodule

macromodule VMW_OR3 (Z,A,B,C);
  //  function : "(A+B+C)";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_FUNCT = "PRIM_OR";
    specparam PRIM_EQUIV = "MED_OR3";
  endspecify
endmodule

macromodule VMW_OR4 (Z,A,B,C,D);
  //  function : "(A+B+C+D)";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_FUNCT = "PRIM_OR";
    specparam PRIM_EQUIV = "MED_OR4";
  endspecify
endmodule

macromodule VMW_OR5 (Z,A,B,C,D,E);
  //  function : "(A+B+C+D+E)";
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 6;
    specparam PRIM_FUNCT = "PRIM_OR";
    specparam PRIM_EQUIV = "MED_OR5";
  endspecify
endmodule


// Nor Gates

macromodule VMW_NOR2 (Z, A, B);
  //  function : "(A+B)'";
  output Z;
  input  A,B;
  specify
    //specparam PRIM_FUNC = "RTL_NOR";
    specparam PRIM_FUNCT = "PRIM_NOR";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "in1";
    //specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
    specparam PRIM_EQUIV = "MED_NOR2";
  endspecify

endmodule

macromodule VMW_NOR3 (Z,A,B,C);
  //  function : "(A+B+C)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_NOR3";
  endspecify
endmodule

macromodule VMW_NOR4 (Z,A,B,C,D);
  //  function : "(A+B+C+D)'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_NOR4";
  endspecify
endmodule

macromodule VMW_NOR5 (Z, A, B, C, D, E);
  //  function : "(A+B+C+D+E)'";
  output Z;
  input  A, B, C, D, E;
  specify
    specparam AREA = 6;
    specparam PRIM_EQUIV = "MED_NOR5";
  endspecify
endmodule


// Xor Gates

macromodule VMW_XOR2 (Z, A, B);
  //  function : "(AB'+ A'B)";
  output Z;
  input  A,B;
  specify
    //specparam PRIM_FUNC = "RTL_XOR";
    specparam PRIM_FUNCT = "PRIM_XOR";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "in1";
    //specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
    specparam PRIM_EQUIV = "MED_XOR2";
  endspecify
endmodule

macromodule VMW_XOR3( Z, A,B,C);
  //  function : "(A'B'C+A'B C'+A B'C'+A B C)";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_FUNCT = "PRIM_XOR";
    specparam PRIM_EQUIV = "MED_XOR3";
  endspecify
endmodule

macromodule VMW_XOR4 (Z, A, B, C, D);
  //  function : "((A B)+((C+D)'))'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_FUNCT = "PRIM_XOR";
    specparam PRIM_EQUIV = "MED_XOR4";
  endspecify
endmodule

macromodule VMW_XOR5 (Z, A, B, C, D,E);
  //  function : ((A B)+((C+D)')) E + ((A B)+((C+D)'))' E'
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 7;
    specparam PRIM_FUNCT = "PRIM_XOR";
    specparam PRIM_EQUIV = "MED_XOR5";
  endspecify
endmodule

// Xnor Gates

macromodule VMW_XNOR2 (Z, A, B);
  //  function : "(AB+A'B')";
  output Z;
  input  A,B;
  specify
    //specparam PRIM_FUNC = "RTL_XNOR";
    specparam PRIM_FUNCT = "PRIM_XNOR";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "in1";
    //specparam PRIM_PORT_B = "in2";
    specparam AREA = 2;
    specparam PRIM_EQUIV = "MED_XNOR2";
  endspecify
endmodule

macromodule VMW_XNOR3( Z, A,B,C);
  //  function : "(A'B'C'+A'B C+A B'C+A B C')";
  output Z;
  input  A, B, C;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_XNOR3";
  endspecify
endmodule

macromodule VMW_XNOR4 (Z, A, B, C, D);
  //  function : "((A+B)((C D)'))'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_XNOR4";
  endspecify
endmodule

macromodule VMW_XNOR5 (Z, A, B, C, D,E);
  //  function : xnor (z,a,b,c,d,e)
  output Z;
  input  A,B,C,D,E;
  specify
    specparam AREA = 7;
    specparam PRIM_EQUIV = "MED_XNOR5";
  endspecify
endmodule




// And-Ors

macromodule VMW_AO21 (Z, A, B, C);
  //  function : "((A B)+C)";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_AO21";
  endspecify
endmodule

macromodule VMW_AO211 (Z, A, B, C, D);
  //  function : "((A B)+C+D)";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 4;
    specparam PRIM_EQUIV = "MED_AO211";
  endspecify
endmodule

macromodule VMW_AO22 (Z, A, B, C, D);
  //  function : "(A B+C D)";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_AO22";
  endspecify
endmodule

macromodule VMW_AO222 (Z, A, B, C, D, E,F);
  //  function : "(A B+C D+E F)";
  output Z;
  input  A, B, C, D, E, F;
  specify
    specparam AREA = 6;
    specparam PRIM_EQUIV = "MED_AO222";
  endspecify
endmodule


// And-Or Inverts

macromodule VMW_AOI21 (Z, A, B, C);
  //  function : "((A B)+C)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_AOI21";
  endspecify
endmodule

macromodule VMW_AOI211 (Z, A, B, C, D);
  //  function : "((A B)+C+D)'";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_AOI211";
  endspecify
endmodule

macromodule VMW_AOI22 (Z, A, B, C, D);
  //  function : "(A B+C D)'";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_AOI22";
  endspecify
endmodule

module VMW_AOI222 (Z, A, B, C, D, E,F);
  //  function : "(A B+C D+E F)'";
  output Z;
  input  A, B, C, D, E, F;
  specify
    specparam AREA = 7;
    specparam PRIM_EQUIV = "MED_AOI222";
  endspecify
endmodule


// Or-And

macromodule VMW_OA31 (Z, A, B, C, D);
  //  function : "((A+B+C)D)";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 4;
    specparam PRIM_EQUIV = "MED_OA31";
  endspecify
endmodule


// Or-And Inverts

macromodule VMW_OAI21 (Z, A, B, C);
  //  function : "((A+B)C)'";
  output Z;
  input  A,B,C;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_OAI21";
  endspecify
endmodule

macromodule VMW_OAI211 (Z, A, B, C, D);
  //  function : "((A+B)C D)'";
  output Z;
  input  A, B, C, D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_OAI211";
  endspecify
endmodule

macromodule VMW_OAI22 (Z, A, B, C, D);
  //  function : "((A+B)(C+D))'";
  output Z;
  input  A,B,C,D;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_OAI22";
  endspecify
endmodule

macromodule VMW_OAI2222 (Z, A, B, C, D, E, F, G, H);
  //  function : "((A+B)(C+D)(E+F)(G+H))'";
  output Z;
  input  A, B, C, D, E, F, G, H;
  specify
    specparam AREA = 9;
    specparam PRIM_EQUIV = "MED_OAI2222";
  endspecify
endmodule


// 3-input majority gate

macromodule VMW_MAJ3 (Z, A, B, C);
  // function: "((AB)+(AC)+(BC))"
  output Z;
  input  A, B, C;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_MAJ3";
  endspecify
endmodule


// Multiplexors

macromodule VMW_MUX2 (Z, A, B, S);
  //  function : "(S'A+S B)";
  output Z;
  input  A, B, S;
  specify
    //specparam PRIM_FUNC = "RTL_MUX2";
    specparam PRIM_FUNCT = "PRIM_MUX";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_A = "in0";
    //specparam PRIM_PORT_B = "in1";
    //specparam PRIM_PORT_S = "sel";
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_MUX2";
  endspecify
endmodule

macromodule VMW_MUX2I (Z, A, B, S);
  //  function : "(S'A'+S B')";
  output Z;
  input  A, B, S;
  specify
    specparam AREA = 3;
    specparam PRIM_EQUIV = "MED_MUX2I";
  endspecify
endmodule

macromodule VMW_MUX21L (Z, A, B, S, SN);
  //  function : "( (A S' SN) + (B S SN') )'";
  output Z;
  input  A, B, S, SN;
  specify
    specparam AREA = 5;
    specparam PRIM_EQUIV = "MED_MUX21L";
  endspecify
endmodule

macromodule VMW_MUX4 ( Z, A, B, D0, D1, D2, D3);
  //  function : "((D0 A'B')+(D1 A B')+(D2 A'B)+(D3 A B))";
  output Z;
  input  A, B, D0, D1, D2, D3;
  specify
    specparam AREA = 7;
    specparam PRIM_EQUIV = "MED_MUX4";
  endspecify
endmodule

macromodule VMW_DEC24L (Z0, Z1, Z2, Z3, A, B);
  //  pin(Z0)  function : "A B' + A' B + A B";
  //  pin(Z1)  function : "A' B' + A' B + A B";
  //  pin(Z2)  function : "A' B' + A B' + A B";
  //  pin(Z3)  function : "A' B' + A B' + A' B";
  output Z0, Z1, Z2, Z3;
  input  A, B;
  specify
    specparam AREA = 6;
    specparam PRIM_EQUIV = "MED_DEC24L";
  endspecify
endmodule


// Adders

module VMW_FADD ( S, CO, CI, A, B);
  //  pin(S)   function : "CI A' B' + CI' A B' + CI' A' B + CI A B";
  //  pin(CO)  function : "CI A B' + CI A' B + CI' A B + CI A B";
  output S, CO;
  input  CI, A, B;
  specify
    specparam AREA = 6;
    specparam PRIM_EQUIV = "MED_FADD";
  endspecify
endmodule

macromodule VMW_HADD (S, CO, A, B);
  //  pin(S)   function : "A' B +  A B'";
  //  pin(CO)  function : "A B";
  output S, CO;
  input  A, B;
  specify
    specparam AREA = 4;
    specparam PRIM_EQUIV = "MED_HADD";
  endspecify
endmodule

/*
// Xilinx Virtex primitives
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
*/

// Flip-flops

// D-flop
macromodule VMW_FD (Q, D, CP);
  output Q;
  input  D, CP;
  specify
    //specparam PRIM_FUNC = "RTL_DFF";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FD";
  endspecify
endmodule

/*module VMW_FD2 (Q, QN, D, CP);
  output Q, QN;
  input  D, CP;
  specify
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FD2";
  endspecify
endmodule*/

// D-flop with clock enable
macromodule VMW_FDE (Q, D, CP, CE);
  output Q;
  input  D, CP, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFE";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDE";
  endspecify
endmodule

// D-flop with enable & async preset & clear
macromodule VMW_FDPCE (Q, D, CP, PRE, CLR, CE);
  output Q;
  input  D, CP, PRE, CLR, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFECP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDPCE";
  endspecify
endmodule

// Negative-edge D-flop
macromodule VMW_FDN (Q, D, CPN);
  output Q;
  input  D, CPN;
  specify
    //specparam PRIM_FUNC = "RTL_DFFN";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CPN";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CPN = "clk";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDN";
  endspecify
endmodule

// D-flop with async preset
macromodule VMW_FDP (Q, D, CP, PRE);
  output Q;
  input  D, CP, PRE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDP";
  endspecify
endmodule

// D-flop with async preset & clear
macromodule VMW_FDPC (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_DFFCP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDPC";
  endspecify
endmodule

// D-flop with async preset & clear, initialized to 0
macromodule VMW_FDPC_INIT0 (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_POR";
    specparam PRIM_FUNCT = "PRIM_POR";
    //specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_RESET = "CLR";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDPC_INIT0";
  endspecify
endmodule

// D-flop with async preset & clear, initialized to 1
macromodule VMW_FDPC_INIT1 (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_POP";
    specparam PRIM_FUNCT = "PRIM_POP";
    //specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_RESET = "CLR";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDPC_INIT1";
  endspecify
endmodule

// D-flop with async preset with Qbar
//macromodule VMW_FDP2 (Q, QN, D, CP, S);
//  output Q, QN;
//  input  D, CP, S;
//  specify
//    specparam AREA = 8;
//    specparam FFCOUNT = 1;
//    specparam SEQ = 1;
//    specparam PRIM_EQUIV = "MED_FDP2";
//  endspecify
//endmodule

// D-flop with clock enable, async preset
macromodule VMW_FDPE (Q, D, CP, PRE, CE);
  output Q;
  input  D, CP, PRE, CE;
  specify
	//specparam PRIM_FUNC = "RTL_DFFEP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDPE";
  endspecify
endmodule

// D-flop with async clear
macromodule VMW_FDC (Q, D, CP, CLR);
  output Q;
  input  D, CP, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_DFFC";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 9;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDC";
  endspecify
endmodule

// D-flop with clock enable, async clear
macromodule VMW_FDCE (Q, D, CP, CLR, CE);
  output Q;
  input  D, CP, CLR, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFEC";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CLR = "clear";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDCE";
  endspecify
endmodule

// Synchronous Filp Flops

// D-flop with enable , sync preset & clear
macromodule VMW_FDSPCE (Q, D, CP, PRE, CLR, CE);
  output Q;
  input  D, CP, PRE, CLR, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFESCP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    specparam PRIM_S_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDSPCE";
  endspecify
endmodule

// D-flop with enable , sync preset 
macromodule VMW_FDSPE (Q, D, CP, PRE, CE);
  output Q;
  input  D, CP, PRE, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFESP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDSPE";
  endspecify
endmodule

// D-flop with enable sync clear
macromodule VMW_FDSCE (Q, D, CP, CLR, CE);
  output Q;
  input  D, CP, CLR, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFESC";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_S_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CLR = "clear";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDSCE";
  endspecify
endmodule

// D-flop with sync preset & clear
macromodule VMW_FDSPC (Q, D, CP, PRE, CLR);
  output Q;
  input  D, CP, PRE, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_DFFSCP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    specparam PRIM_S_RESET = "CLR";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDSPC";
  endspecify
endmodule

// D-flop with sync preset 
macromodule VMW_FDSP (Q, D, CP, PRE);
  output Q;
  input  D, CP, PRE;
  specify
    //specparam PRIM_FUNC = "RTL_DFFSP";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_S_SET = "PRE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDSP";
  endspecify
endmodule

// D-flop with sync  clear
macromodule VMW_FDSC (Q, D, CP, CLR);
  output Q;
  input  D, CP, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_DFFSC";
    specparam PRIM_FUNCT = "PRIM_FF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_S_RESET = "CLR";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "D";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_FDSC";
  endspecify
endmodule

// Dual Edge Flip-flops

// Dual Edge D-flop
macromodule VMW_DDFF (Q, DH, DL, CP);
  output Q;
  input  DH, DL, CP;
  specify
    //specparam PRIM_FUNC = "RTL_DDFF";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    specparam AREA = 8;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFF";
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule VMW_DDFFE (Q, DH, DL, CP, CE);
  output Q;
  input  DH, DL, CP, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DDFFE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFE";
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule VMW_DDFFP (Q, DH, DL, CP, PRE);
  output Q;
  input  DH, DL, CP, PRE;
  specify
    //specparam PRIM_FUNC = "RTL_DDFFP";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFP";
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule VMW_DDFFC (Q, DH, DL, CP, CLR);
  output Q;
  input  DH, DL, CP, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_DDFFC";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFC";
  endspecify
endmodule

//Creating two dummy DualEdge Flip Flop with two Enables
//This Flip Flop will never be in the final netlist
//It will be converted to VMW_DDFFE or VMW_DDFF in nomFFOpt

macromodule VMW_DDFFDE(Q, DH, DL, CP, CE, CE1);
  output Q;
  input  DH, DL, CP, CE, CE1;
  specify
    //specparam PRIM_FUNC = "RTL_DDFFDE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_ENABLE_D = "CE1";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CE = "enable";
    //specparam PRIM_PORT_CE1 = "enable1";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFDE";
  endspecify
endmodule

macromodule VMW_DDFFPCDE(Q, DH, DL, CP, PRE, CLR, CE, CE1);
  output Q;
  input  DH, DL, CP, PRE, CLR, CE, CE1;
  specify
    //specparam PRIM_FUNC = "RTL_DDFFPCDE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    specparam PRIM_ENABLE_D = "CE1";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    //specparam PRIM_PORT_CE = "enable";
    //specparam PRIM_PORT_CE1 = "enable1";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFPCDE";
  endspecify
endmodule

macromodule VMW_DDFFPC (Q, DH, DL, CP, PRE, CLR);
  output Q;
  input  DH, DL, CP, PRE, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_DDFFPC";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFPC";
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule VMW_DDFFPCE (Q, DH, DL, CP, PRE, CLR, CE);
  output Q;
  input  DH, DL, CP, PRE, CLR, CE;
  specify
    //specparam PRIM_FUNC = "RTL_DDFFPCE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CLR = "clear";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFPCE";
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule VMW_DDFFPE (Q, DH, DL, CP, PRE, CE);
   output Q;
   input  DH, DL, CP, PRE, CE;
   specify
    //specparam PRIM_FUNC = "RTL_DDFFPE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_SET = "PRE";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_PRE = "preset";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFPE";
  endspecify
endmodule

// Dual Edge D-flop with clock enable
macromodule VMW_DDFFCE (Q, DH, DL, CP, CLR, CE);
   output Q;
   input  DH, DL, CP, CLR, CE;
   specify
    //specparam PRIM_FUNC = "RTL_DDFFCE";
    specparam PRIM_FUNCT = "PRIM_DDFF";
    //specparam PRIM_CP = "CP";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_ENABLE = "CE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_DH = "DH";
    //specparam PRIM_PORT_DL = "DL";
    //specparam PRIM_PORT_CP = "clk";
    //specparam PRIM_PORT_CLR = "clear";
    //specparam PRIM_PORT_CE = "enable";
    specparam AREA = 11;
    specparam FFCOUNT = 1;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_DDFFCE";
  endspecify
endmodule

// Dual-clocked flop with two inputs, preset and clear
//  at rising edge of CK1, flop latches D1
//  at rising edge of CK1, flop latches D2
//  behavior is undefined for simultaneous rise in CK1 and CK2
module VMW_MC2_FDPC(Q, D1, CP1, D2, CP2, PRE, CLR);
  output Q;
  input  D1, CP1, D2, CP2, PRE, CLR;
  specify
    specparam AREA = 28;
    specparam FFCOUNT = 2;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_MC2_FDPC";
    specparam MED_EQUIV = "MED_MC2_FDPC";
  endspecify
endmodule

macromodule VMW_MC2_FDPC_INIT0(Q, D1, CP1, D2, CP2, PRE, CLR);
 output Q;
 input D1, CP1, D2, CP2, PRE, CLR;
   specify
    specparam AREA = 28;
    specparam FFCOUNT = 2;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_MC2_FDPC_INIT0";
    specparam MED_EQUIV = "MED_MC2_FDPC_INIT0";
  endspecify
endmodule

macromodule MED_MC2_FDPC_INIT0(Q, D1, CP1, D2, CP2, PRE, CLR);
 output Q;
 input D1, CP1, D2, CP2, PRE, CLR;
   specify
    specparam AREA = 28;
    specparam FFCOUNT = 2;
    specparam SEQ = 1;
  endspecify
endmodule

macromodule VMW_MC2_FDPC_INIT1(Q, D1, CP1, D2, CP2, PRE, CLR);
 output Q;
 input D1, CP1, D2, CP2, PRE, CLR;
   specify
    specparam AREA = 28;
    specparam FFCOUNT = 2;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_MC2_FDPC_INIT1";
    specparam MED_EQUIV = "MED_MC2_FDPC_INIT1";
  endspecify
endmodule

macromodule MED_MC2_FDPC_INIT1(Q, D1, CP1, D2, CP2, PRE, CLR);
 output Q;
 input D1, CP1, D2, CP2, PRE, CLR;
   specify
    specparam AREA = 28;
    specparam FFCOUNT = 2;
    specparam SEQ = 1;
  endspecify
endmodule




// Latches

// Positive-enable
macromodule VMW_LD (Q, D, G);
  output Q;
  input  D, G;
  specify
    //specparam PRIM_FUNC = "RTL_LATCH"; // active-high enable
    specparam PRIM_FUNCT = "PRIM_LD";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "A";
    //specparam PRIM_PORT_G = "E";
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LD";
  endspecify
endmodule

macromodule VMW_LDP (Q, D, G, PRE);
  output Q;
  input  D, G, PRE;
  specify
    //specparam PRIM_FUNC = "RTL_LATCH_P";
    specparam PRIM_FUNCT = "PRIM_LD";
    specparam PRIM_SET = "PRE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "A";
    //specparam PRIM_PORT_G = "E";
    //specparam PRIM_PORT_PRE = "P";
    specparam AREA = 8;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LDP";
  endspecify
endmodule

macromodule VMW_LDC (Q, D, G, CLR);
  output Q;
  input  D, G, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_LATCH_C";
    specparam PRIM_FUNCT = "PRIM_LD";
    specparam PRIM_RESET = "CLR";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "A";
    //specparam PRIM_PORT_G = "E";
    //specparam PRIM_PORT_CLR = "C";
    specparam AREA = 8;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LDC";
  endspecify
endmodule

macromodule VMW_LDPC (Q, D, G, PRE, CLR);
  output Q;
  input  D, G, PRE, CLR;
  specify
    //specparam PRIM_FUNC = "RTL_LATCH_PC";
    specparam PRIM_FUNCT = "PRIM_LDPC";
    specparam PRIM_RESET = "CLR";
    specparam PRIM_SET = "PRE";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "A";
    //specparam PRIM_PORT_G = "E";
    //specparam PRIM_PORT_PRE = "P"; 
    //specparam PRIM_PORT_CLR = "C";
    specparam AREA = 8;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LDPC";
  endspecify
endmodule

// Negative-enable
macromodule VMW_LDN (Q, D, GN);
  output Q;
  input  D, GN;
  specify
    //specparam PRIM_FUNC = "RTL_LATCHN"; // active-low enable
    specparam PRIM_FUNCT = "PRIM_LDN";
    //specparam PRIM_PORT_Q = "Z";
    //specparam PRIM_PORT_D = "A";
    //specparam PRIM_PORT_GN = "E";
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LDN";
  endspecify
endmodule

/*macromodule VMW_LD2 (Q, QN, D, G);
  output Q, QN;
  input  D, G;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LD2";
  endspecify
endmodule

macromodule VMW_LDN2 (Q, QN, D, GN);
  output Q, QN;
  input  D, GN;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LDN2";
  endspecify
endmodule*/

/*macromodule VMW_LD2G (Q, D0, G0, D1, G1);
  output Q;
  input  D0, G0, D1, G1;
  specify
    specparam AREA = 7;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_LD2G";
    specparam MED_EQUIV = "MED_LD2G";
  endspecify
endmodule*/


// Pads

// Internal tristate driver
macromodule VMW_BUFIZ (Z, E, A);
  output  Z;  // was inout; changed to output for rtlc-vle
  input  E, A;
  specify
    //specparam PRIM_FUNC = "RTL_TRI";
    specparam PRIM_FUNCT = "PRIM_TRI";
    //specparam PRIM_PORT_Z = "Z";
    //specparam PRIM_PORT_E = "enable";
    //specparam PRIM_PORT_A = "A";
    specparam AREA = 3;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_BUFIZ";
    specparam TRISB = 1;
  endspecify
endmodule

// Tristateable output pad
macromodule VMW_OBUFZ (Z, E, A);
  inout  Z;
  input  E, A;
  specify
    specparam AREA = 3;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_OBUFZ";
    specparam TRISB = 1;
  endspecify
endmodule

// Input pad
macromodule VMW_IBUF (Z, A);
  output Z;
  input  A;
  specify
    specparam AREA = 0;
    specparam PRIM_EQUIV = "MED_IBUF";
  endspecify
endmodule

// Output pad
macromodule VMW_OBUF (Z, A);
  output Z;
  input  A;
  specify
    specparam AREA = 0;
    specparam PRIM_EQUIV = "MED_OBUF";
  endspecify
endmodule


// Pullup/pulldown: can be used on pads, internal tristate busses,
// and undriven nets to set default behavior

macromodule VMW_PULLUP (Z);
  inout  Z;
  specify
    //specparam PRIM_FUNC = "RTL_PULLUP";
    specparam PRIM_FUNCT = "PRIM_PULLUP";
    //specparam PRIM_PORT_Z = "Z";
    specparam AREA = 1;
    specparam PRIM_EQUIV = "MED_PULLUP";
  endspecify
endmodule

macromodule VMW_PULLDOWN (Z);
  inout  Z;
  specify
    //specparam PRIM_FUNC = "RTL_PULLDOWN";
    specparam PRIM_FUNCT = "PRIM_PULLDOWN";
    //specparam PRIM_PORT_Z = "Z";
    specparam AREA = 1;
    specparam PRIM_EQUIV = "MED_PULLDOWN";
  endspecify
endmodule


// Internal tristate bus state preserver

macromodule VMW_KEEPER (Z);
  inout  Z;
  specify
    //specparam PRIM_FUNC = "RTL_KEEPER";
    specparam PRIM_FUNCT = "PRIM_KEEPER";
    //specparam PRIM_PORT_Z = "Z";
    specparam AREA = 1;
    specparam PRIM_EQUIV = "MED_KEEPER";
  endspecify
endmodule


macromodule VMW_DGATE (Q, D, A);
  output Q;
  input  D, A;
  specify
    specparam AREA = 5;
    specparam SEQ = 1;
    specparam LATCH = 1;
    specparam PRIM_EQUIV = "MED_DGATE";
    specparam MED_EQUIV = "MED_DGATE";
  endspecify
endmodule // VMW_DGATE

/*module VMW_RTL_BUF16(Z, A);
  output [15:0] Z;
  input [15:0]  A;
  specify
    specparam AREA = 0;
    specparam PRIM_EQUIV = "MED_RTL_BUF16";
  endspecify
endmodule // VMW_RTL_BUF16*/


/*module VMW_RTL_FD16(Q, D, CP);
  output [15:0] Q;
  input [15:0]  D;
  input         CP;
  specify
    specparam AREA = 64;
    specparam FFCOUNT = 16;
    specparam SEQ = 1;
    specparam PRIM_EQUIV = "MED_RTL_FD16";
    specparam MED_EQUIV = "MED_RTL_FD16";
  endspecify
endmodule // VMW_RTL_FD16 */

// End of library med.rtlc.v

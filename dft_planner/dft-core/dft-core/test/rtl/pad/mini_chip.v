// handcrafted pad fixture: IPAD/OPAD/iopad/IOPAD are blackboxes (no module defs)
module mini_chip(
   inout  wire [3:0] GBUS,
   input  wire CLK_IN,
   output wire DATA_OUT,
   inout  wire GPIO_0,
   inout  wire GPIO_1,
   inout  wire GPIO_2,
   input  wire MODE
);
wire clk_core;
wire dout;
wire g0_in, g0_out, g0_oe;
wire [1:0] mac_oe, mac_din, mac_dout;
wire m_in;
wire unused_c;
wire sel_q;

IPAD u_clk_pad (
   .PAD(CLK_IN),
   .C(clk_core)
);

OPAD u_dout_pad (
   .I(dout),
   .OEN(1'b1),
   .PAD(DATA_OUT)
);

iopad u_gpio0 (
   .OEN(g0_oe),
   .PAD(GPIO_0),
   .I(g0_out),
   .C(g0_in)
);

pad_macro u_macro (
   .oe(mac_oe),
   .din(mac_din),
   .dout(mac_dout),
   .P0(GPIO_1),
   .P1(GPIO_2)
);

IOPAD u_case_trap (   // lib only has lowercase "iopad" -> case-mismatch warning, NOT a pad row
   .OEN(g0_oe),
   .PAD(MODE),
   .I(g0_out),
   .C(m_in)
);

IPAD u_internal_pad (   // PAD on an internal net: gpio must NOT resolve (negative case)
   .PAD(m_in),
   .C(unused_c)
);

sel_macro u_sel (   // wrapper port bound via bit-select at parent: gpio must NOT resolve
   .P(GBUS[2]),
   .oe(m_in),
   .d(dout),
   .q(sel_q)
);

assign dout = clk_core & g0_in;
assign g0_out = dout;
assign g0_oe = m_in;
assign mac_dout = {dout, g0_in};
assign mac_oe = {m_in, m_in};

endmodule

module pad_macro(
   input  wire [1:0] oe,
   output wire [1:0] din,
   input  wire [1:0] dout,
   inout  wire P0,
   inout  wire P1
);
iopad u_p0 (
   .OEN(oe[0]),
   .PAD(P0),
   .I(dout[0]),
   .C(din[0])
);
iopad u_p1 (
   .OEN(oe[1]),
   .PAD(P1),
   .I(dout[1]),
   .C(din[1])
);
endmodule

module sel_macro(
   inout  wire P,
   input  wire oe,
   input  wire d,
   output wire q
);
iopad u_ps (
   .OEN(oe),
   .PAD(P),
   .I(d),
   .C(q)
);
endmodule

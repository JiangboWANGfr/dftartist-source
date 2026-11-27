// trace-into fixture:ip 内一层的结构驱动/负载、行为级(always_ff/assign)输出、两级嵌套。
module leaf_and(input logic i0, input logic i1, output logic o);
  assign o = i0 & i1;
endmodule

module core(input logic ci, output logic co);
  assign co = ~ci;
endmodule

module mid(input logic mi, output logic mo);
  core u_core(.ci(mi), .co(mo));
endmodule

module obuf(input logic d, output logic z);
  assign z = d;
endmodule

module ibuf(input logic p);
endmodule

module ip(input logic a, input logic b, input logic clk,
          output logic y, output logic q, output logic deep,
          output logic w, inout wire io);
  logic m;
  leaf_and u1(.i0(a), .i1(b), .o(m));
  leaf_and u2(.i0(m), .i1(a), .o(y));
  mid u_mid(.mi(m), .mo(deep));
  obuf u3(.d(b), .z(io));
  ibuf u4(.p(io));
  always_ff @(posedge clk) q <= m;

  // DECLARATION INITIALIZER (`wire x = expr;`), not a standalone `assign`. slang's analysis
  // does not report these as drivers, so a fan-in through `wi` used to dead-end silently.
  wire wi = a | b;
  assign w = wi;

  // constant-only block: its fan-in answer must be the literal itself, not an empty list
  wire cst = 1'b0;
endmodule

module top(input logic ta, input logic tb, input logic clk,
           output logic ty, output logic tq, output logic td,
           output logic tw, inout wire tio);
  ip u_ip(.a(ta), .b(tb), .clk(clk), .y(ty), .q(tq), .deep(td), .w(tw), .io(tio));
endmodule

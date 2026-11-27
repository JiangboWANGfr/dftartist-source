module dense_leaf(output wire y);
  assign y = 1'b0;
endmodule

module dense_ports #(parameter N = 4000);
  wire n;
  for (genvar i = 0; i < N; i++) begin : g
    dense_leaf u(n);
  end
endmodule

module legal_assigns;
  wire n = 1'b0;
  assign n = 1'b1;
  assign n = 1'b0;
endmodule

module mixed_ports;
  wire n;
  dense_leaf a(n), b(n);
  assign n = 1'b0;
  assign n = 1'b1;
endmodule

module mixed_reverse;
  wire n;
  assign n = 1'b0;
  assign n = 1'b1;
  dense_leaf a(n), b(n);
endmodule

module initializer_port;
  wire n = 1'b1;
  dense_leaf a(n), b(n);
endmodule

module split_ports;
  wire [1:0] n;
  dense_leaf a(n[0]);
  assign n[1] = 1'b0;
  assign n[1] = 1'b1;
endmodule

module single_wire;
  uwire n = 1'b0;
  assign n = 1'b1;
endmodule

module single_udnt;
  nettype logic scalar_net;
  scalar_net n = 1'b0;
  assign n = 1'b1;
endmodule

module static_variable;
  logic n;
  assign n = 1'b0;
  assign n = 1'b1;
endmodule

module mixed_variable;
  logic n;
  assign n = 1'b0;
  initial n = 1'b1;
endmodule

module resolved_udnt;
  function automatic logic resolve(input logic values[]);
    resolve = 1'b0;
    foreach (values[i]) resolve |= values[i];
  endfunction
  nettype logic scalar_net with resolve;
  scalar_net n = 1'b0;
  assign n = 1'b1;
endmodule

module ref_writer(ref int r);
  assign r = 2;
endmodule

module ref_parent(ref int r);
  ref_writer u(r);
endmodule

module indirect_refs;
  int n;
  ref_parent a(n), b(n);
endmodule

interface driver_if;
  int n;
  modport writer(output n);
endinterface

module iface_writer(driver_if.writer p);
  assign p.n = 1;
endmodule

module indirect_modports;
  driver_if i();
  iface_writer a(i), b(i);
endmodule

// A SDK/Core capability witness, not an independent B oracle.
interface connections_bus;
  logic value;
endinterface

module connections_interface(connections_bus bus);
endmodule

module connections_leaf(input logic [3:0] a, output logic [3:0] y);
  assign y = a;
endmodule

module connections_top(input logic [7:0] a, input logic unused_input,
                       output logic [3:0] y);
  connections_leaf wired(.a(a[5:2]), .y(y));
  connections_leaf tied(.a(4'b10xz), .y());
  connections_leaf open_ports(.a(), .y());
  connections_bus bus();
  connections_interface unknown_port(.bus(bus));
endmodule

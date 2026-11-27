// B independent finite KAT. Bit mapping from source[7:3] to lane input[4:0].
interface b_oc_bus;
  logic valid;
endinterface

module b_oc_lane(input logic [4:0] d, output wire [4:0] q);
  assign q = d;
endmodule

module b_oc_sink(input logic [3:0] c, input wire spare, b_oc_bus bus);
endmodule

module b_oc_top(input logic [9:0] source, output wire [4:0] result);
  wire [4:0] routed;
  wire unused_signal;
  b_oc_bus bus();
  b_oc_lane lane(.d(source[7:3]), .q(routed));
  b_oc_sink sink(.c(4'b01zx), .spare(), .bus(bus));
  assign result = routed;
endmodule

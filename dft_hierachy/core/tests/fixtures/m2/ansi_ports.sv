// Explicit ANSI port: the external joined port is distinct from internal hi/lo.
// Oracle: joined[1:0] <-> lo[1:0], joined[3:2] <-> hi[1:0].
module ansi_split(input .joined({hi[1:0], lo[1:0]}), output wire [3:0] result);
  wire [1:0] hi, lo;
  assign result = {hi, lo};
endmodule

module ansi_ports(input wire [3:0] data, output wire [3:0] result);
  ansi_split u_split(.joined(data), .result(result));
endmodule

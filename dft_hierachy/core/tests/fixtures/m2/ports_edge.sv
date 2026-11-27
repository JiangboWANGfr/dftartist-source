// M2 contract fixtures for A09/A10 and process endpoints. Expectations are
// written by hand in test_contract.py.

// A non-ANSI external port whose four bits come from two internal signals.
module split_port(.joined({hi[1:0], lo[1:0]}), result);
  input wire [1:0] hi, lo;
  output wire [3:0] result;
  assign result = {hi, lo};
endmodule

module complex_ports(input wire [3:0] data, output wire [3:0] result);
  split_port u_split(.joined(data), .result(result));
endmodule

// No declaration or library entry exists for mystery_cell.Y. The empty
// connection has no expression from which a bit width can be inferred.
module unknown_blackbox(input wire a, output wire y);
  mystery_cell u_missing(.A(a), .Y());
  assign y = a;
endmodule

// One process writes two signals and reads two signals. In each query both
// signals have bit zero, so Endpoint.bits alone cannot identify the endpoint.
module process_at(input wire a, b, output logic y, z);
  always_comb begin
    y = a & b;
    z = b;
  end
endmodule

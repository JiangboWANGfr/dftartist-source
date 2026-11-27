// Fixture for `hier verify-sharing`: a design with a compile error must be rejected,
// not reported as "0 differences".
module broken(input logic a, output logic y);
  assign y = a & undeclared_signal;
endmodule

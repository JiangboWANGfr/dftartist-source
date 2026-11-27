// Found as <libdir>/cell_and2.v (default ".v" extension).
module cell_and2(input a, input b, output z);
  wire nz;
  cell_inv u_inv (.a(nz), .z(z));   // a second library lookup, triggered by a library file
  assign nz = ~(a & b);
endmodule

// A second module in the same library file. It is instantiated by nobody, and because the file is
// a LIBRARY unit it must not show up as a design top.
module cell_unused_top(input a, output z);
  assign z = a;
endmodule

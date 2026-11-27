// Named by `-v` in the filelist: a LIBRARY file. cell_or2 is instantiated by the design;
// cell_never_used is not, and must not become a design top just because the file was listed.
module cell_or2(input a, input b, output z);
  assign z = a | b;
endmodule

module cell_never_used(input a, output z);
  assign z = ~a;
endmodule

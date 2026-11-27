module edge_leaf(input wire d, output wire q);
  assign q = d;
endmodule
module edges(input wire a, output wire y);
  wire \net/with.dot ;
  assign \net/with.dot = a;
  for (genvar k=-1; k<=0; k++) begin : g
    wire local_signal;
    edge_leaf u[2:1][1:0](.d(a), .q());
    edge_leaf \u[2][1] (.d(a), .q(local_signal));
  end
  absent_lookup box(.A(a), .Y(y));
  buf primitive_pin(y, a);
endmodule

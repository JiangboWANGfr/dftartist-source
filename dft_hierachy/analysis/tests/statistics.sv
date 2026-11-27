module stats_leaf #(parameter W=4)(input logic c, input logic [W-1:0] d, output logic [W-1:0] q);
  always_ff @(posedge c) q <= d;
endmodule
module stats_top(input logic c, input logic [10:0] d, output logic [10:0] q);
  stats_leaf #(3) a(c,d[2:0],q[2:0]);
  stats_leaf #(5) b(c,d[7:3],q[7:3]);
  stats_leaf #(3) twin(c,d[10:8],q[10:8]);
endmodule
module stats_holes(input logic c, input logic [5:0] d, output logic [11:0] q);
  always_ff @(posedge c) begin q[1:0] <= d[1:0]; q[5:4] <= d[3:2]; q[9:8] <= d[5:4]; end
endmodule
module stats_overlap(input logic c, input logic [5:0] d, output logic [7:0] q);
  always @(posedge c) q[5:0] <= d;
  always @(negedge c) q[7:4] <= d[3:0];
endmodule
module stats_many(input logic c,d, output logic [229:0] q);
  for(genvar i=0;i<230;i++) begin: g
    always_ff @(posedge c) q[i] <= d;
  end
endmodule

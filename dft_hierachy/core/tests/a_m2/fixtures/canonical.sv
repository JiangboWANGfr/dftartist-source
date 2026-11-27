module a_state(input wire clk, rst_n, d, output logic q);
  logic first;
  always @(posedge clk or negedge rst_n)
    if (!rst_n) begin first <= 0; q <= 0; end
    else begin first <= d; q <= first; end
endmodule
module a_branch(input wire clk, rst_n, input wire [1:0] d, output wire [1:0] q);
  for (genvar n=0; n<2; ++n) begin : g
    a_state u(.clk, .rst_n, .d(d[n]), .q(q[n]));
  end
endmodule
module repeated(input wire c0,c1,rst_n,input wire [3:0] d,output wire [3:0] q);
  a_branch b0(.clk(c0),.rst_n,.d(d[1:0]),.q(q[1:0]));
  a_branch b1(.clk(c1),.rst_n,.d(d[3:2]),.q(q[3:2]));
endmodule

module ram_model(input wire CLK, input wire [3:0] D, output wire [3:0] Q);
  assign Q=D;
endmodule
module macro_bank(input wire clk, input wire [7:0] d, output wire [7:0] q);
  ram_model a(.CLK(clk), .D(d[3:0]), .Q(q[3:0]));
  ram_model b(.CLK(clk), .D({d[0],d[1],d[2],d[3]}), .Q(q[7:4]));
endmodule
module macro_top(input wire CLK, input wire [7:0] D, output wire [7:0] Q);
  wire [7:0] spare;
  macro_bank left(CLK,D,Q), right(CLK,D,spare);
  ram_model \ram.dot (.CLK(1'b0),.D(4'b0101),.Q());
  for(genvar i=0;i<2;i++)begin:g
    wire [3:0] q;
    ram_model m(.CLK(CLK),.D(D[3:0]),.Q(q));
  end
  wire [3:0] unknown_q;
  unknown_ram opaque(.CLK(1'b0),.D(D[3:0]),.Q(unknown_q));
endmodule
module macro_logic(input logic CLK, input wire [3:0] D, output wire [3:0] Q);
  logic div;
  always_ff @(posedge CLK) div<=~div;
  ram_model m(div,D,Q);
endmodule

module macro_mixed(input wire CLK, input wire [3:0] D, output wire [3:0] Q);
  wire [3:0] unknown_q;
  ram_model m(CLK,D,Q);
  unknown_ram opaque(.CLK(CLK),.D(D),.Q(unknown_q));
endmodule

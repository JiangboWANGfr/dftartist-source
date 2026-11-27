// tests/fixtures/soc.v
module cpu(input clk, input rst_n, output reg [31:0] pc);
  always @(posedge clk) pc <= rst_n ? pc + 1 : 32'b0;
endmodule
module mem(input clk, input [31:0] addr, output reg [31:0] data);
  always @(posedge clk) data <= addr;
endmodule
module soc(input clk, input rst_n);
  wire [31:0] pc;
  cpu u_cpu(.clk(clk), .rst_n(rst_n), .pc(pc));
  mem u_mem(.clk(clk), .addr(pc), .data());
endmodule

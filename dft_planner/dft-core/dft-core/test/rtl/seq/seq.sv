// Ground-truth sequential patterns for `hdl sequential` (L4 get-sequential).
// Each leaf module has a known clock / async-reset classification.

// async active-low reset: clk=clock(posedge), rst_n=asyncReset(negedge)
module dff_async(input clk, input rst_n, input d, output reg q);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 1'b0;
    else        q <= d;
endmodule

// synchronous reset only: clk=clock(posedge), NO asyncReset (rst not in sensitivity list)
module dff_sync(input clk, input rst, input d, output reg q);
  always_ff @(posedge clk)
    if (rst) q <= 1'b0;
    else     q <= d;
endmodule

// async active-high set, begin/end body: clk=clock(posedge), arst=asyncReset(posedge)
module dff_aset(input clk, input arst, input d, output reg q);
  always_ff @(posedge clk or posedge arst) begin
    if (arst) q <= 1'b1;
    else      q <= d;
  end
endmodule

// plain always edge, no reset: clk2=clock(posedge)
module plain_ff(input clk2, input d2, output reg q2);
  always @(posedge clk2) q2 <= d2;
endmodule

// combinational: must NOT appear in get-sequential output
module comb(input a, input b, output reg y);
  always @(*) y = a & b;
endmodule

module top(input clk, input rst_n, input rst, input arst, input clk2,
           input [3:0] din, output [3:0] dout, output yo);
  dff_async u_async(.clk(clk),  .rst_n(rst_n), .d(din[0]), .q(dout[0]));
  dff_sync  u_sync (.clk(clk),  .rst(rst),     .d(din[1]), .q(dout[1]));
  dff_aset  u_aset (.clk(clk),  .arst(arst),   .d(din[2]), .q(dout[2]));
  plain_ff  u_plain(.clk2(clk2),               .d2(din[3]), .q2(dout[3]));
  comb      u_comb (.a(din[0]), .b(din[1]),    .y(yo));
endmodule

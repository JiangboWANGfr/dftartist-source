// MBIST compatibility-rule fixture, sized so the UI's scaling claims can be tested:
// 12 memories, two cell types (different depth + DataOutStage), three clock domains.
// No DEF, no UPF, no SDC — exactly the inputs the planner is meant to need.
//
// Expected automatic partition:
//   core_clk (= ref_clk root)  MEM_A0..A5 (8K) + MEM_C0..C1 (4K)  -> one controller, 2 steps
//   div2                       MEM_D0, MEM_D1                     -> its own controller (CCR3)
//   div4                       MEM_E0, MEM_E1                     -> its own controller (CCR3)
module clkdiv(input wire clk_in, output wire clk_out);
   reg d;
   always @(posedge clk_in) d <= ~d;
   assign clk_out = d;
endmodule

module soc_mem(input wire ref_clk, input wire [15:0] din, output wire [15:0] dout);
   wire core_clk;
   wire div2;
   wire div4;
   assign core_clk = ref_clk;
   clkdiv u_div2(.clk_in(ref_clk), .clk_out(div2));
   clkdiv u_div4(.clk_in(div2),    .clk_out(div4));

   wire [15:0] qa0, qa1, qa2, qa3, qa4, qa5, qc0, qc1, qd0, qd1, qe0, qe1;

   BIG_RAM_8Kx16   MEM_A0 (.CLK(core_clk), .D(din), .Q(qa0), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_A1 (.CLK(core_clk), .D(din), .Q(qa1), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_A2 (.CLK(core_clk), .D(din), .Q(qa2), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_A3 (.CLK(core_clk), .D(din), .Q(qa3), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_A4 (.CLK(core_clk), .D(din), .Q(qa4), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_A5 (.CLK(core_clk), .D(din), .Q(qa5), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   SMALL_RAM_4Kx16 MEM_C0 (.CLK(core_clk), .D(din), .Q(qc0), .A(12'd0), .WEN(1'b1), .CEN(1'b0));
   SMALL_RAM_4Kx16 MEM_C1 (.CLK(core_clk), .D(din), .Q(qc1), .A(12'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_D0 (.CLK(div2),     .D(din), .Q(qd0), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_D1 (.CLK(div2),     .D(din), .Q(qd1), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_E0 (.CLK(div4),     .D(din), .Q(qe0), .A(13'd0), .WEN(1'b1), .CEN(1'b0));
   BIG_RAM_8Kx16   MEM_E1 (.CLK(div4),     .D(din), .Q(qe1), .A(13'd0), .WEN(1'b1), .CEN(1'b0));

   assign dout = qa0 ^ qa1 ^ qa2 ^ qa3 ^ qa4 ^ qa5 ^ qc0 ^ qc1 ^ qd0 ^ qd1 ^ qe0 ^ qe1;
endmodule

//--------------------------------------------------------------------------
//
//  Unpublished work. Copyright 2025 Siemens
//
//  This material contains trade secrets or otherwise confidential 
//  information owned by Siemens Industry Software Inc. or its affiliates 
//  (collectively, SISW), or its licensors. Access to and use of this 
//  information is strictly limited as set forth in the Customer's 
//  applicable agreements with SISW.
//
//--------------------------------------------------------------------------
//  File created by: Tessent Shell
//          Version: 2025.3
//       Created on: Wed Jul 22 11:09:37 CST 2026
//--------------------------------------------------------------------------

  
module processor_core_logic_test_tessent_clk_shaper_reset_inactive (
  input wire clk_in,
  input wire rst,
  input wire en0,
  input wire en1,
  output wire clk_out
);
reg en1_latch, en0_latch;
 
// Instantiated a real cell for the multiplexer to avoid glitches during simulation in case you attempt to do gate level
// prior to replacing the Clock Shaper with a real cell.
  
clock_mux21 tessent_persistent_cell_mux (.A0(en0_latch), .A1(en1_latch), .S0(clk_in), .Y(clk_out));
   
 
always @ (clk_in or en0 or rst) begin
  if (rst) begin
    en0_latch <= 1'b0;
  end else if (clk_in) begin
    en0_latch <= en0;
  end
end
 
always @ (clk_in or en1 or rst) begin
  if (rst) begin
    en1_latch <= 1'b0;
  end else if (~clk_in) begin
    en1_latch <= en1;
  end
end
 
endmodule 
 
  

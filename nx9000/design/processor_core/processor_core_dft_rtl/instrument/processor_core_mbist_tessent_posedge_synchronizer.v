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
//       Created on: Wed Jul 22 11:09:01 CST 2026
//--------------------------------------------------------------------------

  
module processor_core_mbist_tessent_posedge_synchronizer (
  input wire d,
  input wire clk,
  output reg q
);
reg ntc_retiming_q_reg;
always @ (posedge clk) begin
  ntc_retiming_q_reg <= d;
  q <= ntc_retiming_q_reg;
end
endmodule

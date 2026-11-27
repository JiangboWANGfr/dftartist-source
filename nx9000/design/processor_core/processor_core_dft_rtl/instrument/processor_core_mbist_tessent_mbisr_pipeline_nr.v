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
//       Created on: Wed Jul 22 11:09:07 CST 2026
//--------------------------------------------------------------------------

module processor_core_mbist_tessent_mbisr_pipeline_nr (
  input wire CLK,
  input wire RSTB,
  input wire SI,
  output wire SO,
  input wire SE,
  input wire [0:0] D,
  input wire MSO,
  input wire MSEL,
  output wire [0:0] Q
);
reg [0:0] ShiftReg;
reg       retime;
// synopsys async_set_reset "RSTB"
always @ ( posedge CLK or negedge RSTB) begin
 if (~RSTB) begin
   ShiftReg <= 0;
 end else begin
   if (SE) begin
     ShiftReg <= SI;
   end else begin
     ShiftReg <= D;
   end
 end
end
// synopsys async_set_reset "RSTB"
always @ (negedge CLK or negedge RSTB) begin
 if (~RSTB) begin
   retime <= 0;
 end else begin
   if (MSEL) 
      retime <= MSO;
   else
      retime <= ShiftReg[0];
 end
end
assign SO = retime;
assign Q  = ShiftReg[0:0];
 
 
endmodule

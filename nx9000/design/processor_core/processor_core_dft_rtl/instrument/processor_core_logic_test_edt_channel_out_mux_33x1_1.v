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
//       Created on: Wed Jul 22 11:09:39 CST 2026
//--------------------------------------------------------------------------

module processor_core_logic_test_edt_channel_out_mux_33x1_1 (
  mux_in0, mux_en0,
  mux_in1, mux_en1,
  mux_out
);
 
input  [32:0]  mux_in0, mux_in1;
input  [0:0]   mux_en0;
input  [0:0]   mux_en1;
output [32:0]  mux_out;
 
assign mux_out = ( mux_in0 & {33{|mux_en0}} ) |
               ( mux_in1 & {33{|mux_en1}} ) ;
 
endmodule

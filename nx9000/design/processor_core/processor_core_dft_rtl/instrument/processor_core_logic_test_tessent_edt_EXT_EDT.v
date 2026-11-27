//--------------------------------------------------------------------------------
//
//  Unpublished work. Copyright 2025 Siemens
//
//  This material contains trade secrets or otherwise confidential 
//  information owned by Siemens Industry Software Inc. or its affiliates 
//  (collectively, SISW), or its licensors. Access to and use of this 
//  information is strictly limited as set forth in the Customer's 
//  applicable agreements with SISW.
//
//--------------------------------------------------------------------------------
//  File created by: Tessent Shell
//          Version: 2025.3
//       Created on: Wed Jul 22 11:09:47 CST 2026
//
//       IP version: 8
//--------------------------------------------------------------------------------


module processor_core_logic_test_tessent_edt_EXT_EDT_decompressor_segment_1 (
   input  wire         edt_clock,
   input  wire         edt_update,
   input  wire         scan_en,
   input  wire [  1:0] edt_channels_in,
   output reg  [122:0] edt_scan_in,
   input  wire         from_next_segment,
   output wire         to_next_segment,
   input  wire         unsegmented_bit_9
);
   reg    [ 15:0] lfsm_vec;
   reg    [ 15:0] lfsm_vec_lockup;
   wire   [ 15:0] lfsm_vec_lockup_c;

   // synopsys sync_set_reset edt_update
   always @(posedge edt_clock)
   begin : lfsm
      if (edt_update == 1'b1) begin
         lfsm_vec <= 16'b0000000000000000;
      end
      else begin
         lfsm_vec[ 0] <= lfsm_vec[ 1];
         lfsm_vec[ 1] <= lfsm_vec[ 2] ^ edt_channels_in[0];
         lfsm_vec[ 2] <= lfsm_vec[ 3];
         lfsm_vec[ 3] <= lfsm_vec[ 4] ^ edt_channels_in[1];
         lfsm_vec[ 4] <= lfsm_vec[ 5];
         lfsm_vec[ 5] <= lfsm_vec[ 6] ^ edt_channels_in[0];
         lfsm_vec[ 6] <= from_next_segment;
         lfsm_vec[ 7] <= lfsm_vec[ 8] ^ unsegmented_bit_9;
         lfsm_vec[ 8] <= lfsm_vec[ 9] ^ edt_channels_in[1];
         lfsm_vec[ 9] <= lfsm_vec[10];
         lfsm_vec[10] <= lfsm_vec[11] ^ edt_channels_in[1];
         lfsm_vec[11] <= lfsm_vec[12] ^ lfsm_vec[ 4];
         lfsm_vec[12] <= lfsm_vec[13] ^ edt_channels_in[1];
         lfsm_vec[13] <= lfsm_vec[14];
         lfsm_vec[14] <= lfsm_vec[15] ^ edt_channels_in[0];
         lfsm_vec[15] <= lfsm_vec[ 0];
      end
   end

   assign to_next_segment = lfsm_vec[ 7];

   always @(negedge edt_clock)
   begin : lockup_cells
      lfsm_vec_lockup <= lfsm_vec;
   end

   assign lfsm_vec_lockup_c = lfsm_vec_lockup & {16{scan_en}};

   always @(lfsm_vec_lockup_c)
   begin : phase_shifter
      edt_scan_in[  0] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[  1] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[  2] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[  3] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[  4] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[  5] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[  6] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[  7] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[  8] = lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[  9] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 10] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 11] = lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 12] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 13] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 14] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 15] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[ 16] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 5];
      edt_scan_in[ 17] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[ 18] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 19] = lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 20] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 21] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 22] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 23] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 24] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 25] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 26] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 27] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 28] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 29] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 30] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 31] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 32] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 33] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 34] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 35] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 7];
      edt_scan_in[ 36] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 37] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 6];
      edt_scan_in[ 38] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 39] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 40] = lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 41] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 42] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 43] = lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 44] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 45] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 46] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 47] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 3];
      edt_scan_in[ 48] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 49] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 50] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 51] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 52] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 53] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 54] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 55] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 6];
      edt_scan_in[ 56] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 57] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 8];
      edt_scan_in[ 58] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 59] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 60] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 61] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 62] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 8];
      edt_scan_in[ 63] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[ 64] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 65] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 66] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 8];
      edt_scan_in[ 67] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 68] = lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 69] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 70] = lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 71] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 72] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 73] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 74] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 75] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 76] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 7];
      edt_scan_in[ 77] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 5];
      edt_scan_in[ 78] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 79] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 80] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 81] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 82] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 83] = lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 84] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 8];
      edt_scan_in[ 85] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 86] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 87] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 88] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[ 89] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 90] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[ 91] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 92] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[ 93] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 94] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 95] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 96] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 97] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 7];
      edt_scan_in[ 98] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 99] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[100] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[101] = lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[102] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[103] = lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[104] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[105] = lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[106] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 9];
      edt_scan_in[107] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[108] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 8];
      edt_scan_in[109] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[110] = lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[111] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[112] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[113] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[114] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 7];
      edt_scan_in[115] = lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[116] = lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[117] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[118] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[119] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[120] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[121] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 8];
      edt_scan_in[122] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[12];
   end

endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_decompressor_segment_2 (
   input  wire         edt_clock,
   input  wire         edt_update,
   input  wire         scan_en,
   input  wire [  1:0] edt_channels_in,
   output reg  [122:0] edt_scan_in,
   input  wire         from_previous_segment,
   output wire         to_previous_segment,
   output wire         unsegmented_bit_9
);
   reg    [ 16:0] lfsm_vec;
   reg    [ 16:0] lfsm_vec_lockup;
   wire   [ 16:0] lfsm_vec_lockup_c;

   // synopsys sync_set_reset edt_update
   always @(posedge edt_clock)
   begin : lfsm
      if (edt_update == 1'b1) begin
         lfsm_vec <= 17'b00000000000000000;
      end
      else begin
         lfsm_vec[ 0] <= lfsm_vec[ 1];
         lfsm_vec[ 1] <= lfsm_vec[ 2];
         lfsm_vec[ 2] <= lfsm_vec[ 3];
         lfsm_vec[ 3] <= lfsm_vec[ 4] ^ edt_channels_in[1];
         lfsm_vec[ 4] <= lfsm_vec[ 5];
         lfsm_vec[ 5] <= lfsm_vec[ 6] ^ edt_channels_in[1];
         lfsm_vec[ 6] <= lfsm_vec[ 7];
         lfsm_vec[ 7] <= lfsm_vec[ 8] ^ edt_channels_in[0];
         lfsm_vec[ 8] <= lfsm_vec[ 9];
         lfsm_vec[ 9] <= lfsm_vec[10];
         lfsm_vec[10] <= lfsm_vec[11] ^ edt_channels_in[0];
         lfsm_vec[11] <= lfsm_vec[12];
         lfsm_vec[12] <= lfsm_vec[13] ^ edt_channels_in[0];
         lfsm_vec[13] <= lfsm_vec[14] ^ lfsm_vec[ 6];
         lfsm_vec[14] <= lfsm_vec[15] ^ edt_channels_in[1];
         lfsm_vec[15] <= lfsm_vec[16];
         lfsm_vec[16] <= from_previous_segment ^ edt_channels_in[0];
      end
   end

   assign to_previous_segment = lfsm_vec[ 0];
   assign unsegmented_bit_9   = lfsm_vec[ 2];

   always @(negedge edt_clock)
   begin : lockup_cells
      lfsm_vec_lockup <= lfsm_vec;
   end

   assign lfsm_vec_lockup_c = lfsm_vec_lockup & {17{scan_en}};

   always @(lfsm_vec_lockup_c)
   begin : phase_shifter
      edt_scan_in[  0] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[  1] = lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[  2] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[  3] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[  4] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[  5] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[  6] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[  7] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[  8] = lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[  9] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 10] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 11] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 12] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 13] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 14] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 15] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 16] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 17] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 18] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 19] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 20] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 21] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 22] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 23] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 24] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 25] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 26] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[15] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 27] = lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 28] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 29] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 30] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 31] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 32] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 33] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 34] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 35] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 36] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 37] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 38] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 39] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 40] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 41] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 42] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 43] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 44] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 45] = lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 46] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 47] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 48] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 49] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 50] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 51] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 52] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 53] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 54] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[ 55] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 56] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 57] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 58] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 59] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 60] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 61] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 62] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 63] = lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 64] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 65] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 66] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 67] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 68] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 69] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 70] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 71] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 72] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[15] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 73] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 74] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 75] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[10];
      edt_scan_in[ 76] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 77] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 78] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 79] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 80] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 7] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 81] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 82] = lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 83] = lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 84] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 85] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 86] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 87] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[ 88] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 89] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 90] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 91] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 92] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[ 93] = lfsm_vec_lockup_c[10] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 94] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[ 95] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 96] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 97] = lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[ 98] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[ 99] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[100] = lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[101] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[15] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[102] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[103] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 2] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[104] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[105] = lfsm_vec_lockup_c[ 4] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[106] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[107] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[108] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 8] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[109] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[110] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[12];
      edt_scan_in[111] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[112] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[15];
      edt_scan_in[113] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 9] ^ lfsm_vec_lockup_c[11];
      edt_scan_in[114] = lfsm_vec_lockup_c[ 3] ^ lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[115] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[ 5] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[116] = lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[117] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[118] = lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[15] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[119] = lfsm_vec_lockup_c[ 1] ^ lfsm_vec_lockup_c[11] ^ lfsm_vec_lockup_c[13];
      edt_scan_in[120] = lfsm_vec_lockup_c[ 6] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[16];
      edt_scan_in[121] = lfsm_vec_lockup_c[12] ^ lfsm_vec_lockup_c[13] ^ lfsm_vec_lockup_c[14];
      edt_scan_in[122] = lfsm_vec_lockup_c[ 0] ^ lfsm_vec_lockup_c[14] ^ lfsm_vec_lockup_c[16];
   end

endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_decompressor (
   input  wire         edt_clock,
   input  wire         edt_update,
   input  wire         scan_en,
   input  wire [  1:0] edt_channels_in,
   output wire [245:0] edt_scan_in
);
   wire           seg_1to2;
   wire           seg_2to1;
   wire           unsegmented_bit_9;

   processor_core_logic_test_tessent_edt_EXT_EDT_decompressor_segment_1 segment1 (
      .edt_clock(edt_clock),
      .edt_update(edt_update),
      .scan_en(scan_en),
      .edt_channels_in(edt_channels_in[1:0]),
      .edt_scan_in(edt_scan_in[122:0]),
      .from_next_segment(seg_2to1),
      .to_next_segment(seg_1to2),
      .unsegmented_bit_9(unsegmented_bit_9));
   processor_core_logic_test_tessent_edt_EXT_EDT_decompressor_segment_2 segment2 (
      .edt_clock(edt_clock),
      .edt_update(edt_update),
      .scan_en(scan_en),
      .edt_channels_in(edt_channels_in[1:0]),
      .edt_scan_in(edt_scan_in[245:123]),
      .from_previous_segment(seg_1to2),
      .to_previous_segment(seg_2to1),
      .unsegmented_bit_9(unsegmented_bit_9));
endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_low_power_shift_decoder (
   input  wire [124:0] encoded_control,
   output wire [245:0] decoded_control
);
   assign decoded_control[  0] = encoded_control[  0];
   assign decoded_control[  1] = encoded_control[  0];
   assign decoded_control[  2] = encoded_control[  1];
   assign decoded_control[  3] = encoded_control[  1];
   assign decoded_control[  4] = encoded_control[  2];
   assign decoded_control[  5] = encoded_control[  2];
   assign decoded_control[  6] = encoded_control[  3];
   assign decoded_control[  7] = encoded_control[  3];
   assign decoded_control[  8] = encoded_control[  4];
   assign decoded_control[  9] = encoded_control[  4];
   assign decoded_control[ 10] = encoded_control[  5];
   assign decoded_control[ 11] = encoded_control[  5];
   assign decoded_control[ 12] = encoded_control[  6];
   assign decoded_control[ 13] = encoded_control[  6];
   assign decoded_control[ 14] = encoded_control[  7];
   assign decoded_control[ 15] = encoded_control[  7];
   assign decoded_control[ 16] = encoded_control[  8];
   assign decoded_control[ 17] = encoded_control[  8];
   assign decoded_control[ 18] = encoded_control[  9];
   assign decoded_control[ 19] = encoded_control[  9];
   assign decoded_control[ 20] = encoded_control[ 10];
   assign decoded_control[ 21] = encoded_control[ 10];
   assign decoded_control[ 22] = encoded_control[ 11];
   assign decoded_control[ 23] = encoded_control[ 11];
   assign decoded_control[ 24] = encoded_control[ 12];
   assign decoded_control[ 25] = encoded_control[ 12];
   assign decoded_control[ 26] = encoded_control[ 13];
   assign decoded_control[ 27] = encoded_control[ 13];
   assign decoded_control[ 28] = encoded_control[ 14];
   assign decoded_control[ 29] = encoded_control[ 14];
   assign decoded_control[ 30] = encoded_control[ 15];
   assign decoded_control[ 31] = encoded_control[ 15];
   assign decoded_control[ 32] = encoded_control[ 16];
   assign decoded_control[ 33] = encoded_control[ 16];
   assign decoded_control[ 34] = encoded_control[ 17];
   assign decoded_control[ 35] = encoded_control[ 17];
   assign decoded_control[ 36] = encoded_control[ 18];
   assign decoded_control[ 37] = encoded_control[ 18];
   assign decoded_control[ 38] = encoded_control[ 19];
   assign decoded_control[ 39] = encoded_control[ 19];
   assign decoded_control[ 40] = encoded_control[ 20];
   assign decoded_control[ 41] = encoded_control[ 20];
   assign decoded_control[ 42] = encoded_control[ 21];
   assign decoded_control[ 43] = encoded_control[ 21];
   assign decoded_control[ 44] = encoded_control[ 22];
   assign decoded_control[ 45] = encoded_control[ 22];
   assign decoded_control[ 46] = encoded_control[ 23];
   assign decoded_control[ 47] = encoded_control[ 23];
   assign decoded_control[ 48] = encoded_control[ 24];
   assign decoded_control[ 49] = encoded_control[ 24];
   assign decoded_control[ 50] = encoded_control[ 25];
   assign decoded_control[ 51] = encoded_control[ 25];
   assign decoded_control[ 52] = encoded_control[ 26];
   assign decoded_control[ 53] = encoded_control[ 26];
   assign decoded_control[ 54] = encoded_control[ 27];
   assign decoded_control[ 55] = encoded_control[ 27];
   assign decoded_control[ 56] = encoded_control[ 28];
   assign decoded_control[ 57] = encoded_control[ 28];
   assign decoded_control[ 58] = encoded_control[ 29];
   assign decoded_control[ 59] = encoded_control[ 29];
   assign decoded_control[ 60] = encoded_control[ 30];
   assign decoded_control[ 61] = encoded_control[ 30];
   assign decoded_control[ 62] = encoded_control[ 31];
   assign decoded_control[ 63] = encoded_control[ 31];
   assign decoded_control[ 64] = encoded_control[ 32];
   assign decoded_control[ 65] = encoded_control[ 32];
   assign decoded_control[ 66] = encoded_control[ 33];
   assign decoded_control[ 67] = encoded_control[ 33];
   assign decoded_control[ 68] = encoded_control[ 34];
   assign decoded_control[ 69] = encoded_control[ 34];
   assign decoded_control[ 70] = encoded_control[ 35];
   assign decoded_control[ 71] = encoded_control[ 35];
   assign decoded_control[ 72] = encoded_control[ 36];
   assign decoded_control[ 73] = encoded_control[ 36];
   assign decoded_control[ 74] = encoded_control[ 37];
   assign decoded_control[ 75] = encoded_control[ 37];
   assign decoded_control[ 76] = encoded_control[ 38];
   assign decoded_control[ 77] = encoded_control[ 38];
   assign decoded_control[ 78] = encoded_control[ 39];
   assign decoded_control[ 79] = encoded_control[ 39];
   assign decoded_control[ 80] = encoded_control[ 40];
   assign decoded_control[ 81] = encoded_control[ 40];
   assign decoded_control[ 82] = encoded_control[ 41];
   assign decoded_control[ 83] = encoded_control[ 41];
   assign decoded_control[ 84] = encoded_control[ 42];
   assign decoded_control[ 85] = encoded_control[ 42];
   assign decoded_control[ 86] = encoded_control[ 43];
   assign decoded_control[ 87] = encoded_control[ 43];
   assign decoded_control[ 88] = encoded_control[ 44];
   assign decoded_control[ 89] = encoded_control[ 44];
   assign decoded_control[ 90] = encoded_control[ 45];
   assign decoded_control[ 91] = encoded_control[ 45];
   assign decoded_control[ 92] = encoded_control[ 46];
   assign decoded_control[ 93] = encoded_control[ 46];
   assign decoded_control[ 94] = encoded_control[ 47];
   assign decoded_control[ 95] = encoded_control[ 47];
   assign decoded_control[ 96] = encoded_control[ 48];
   assign decoded_control[ 97] = encoded_control[ 48];
   assign decoded_control[ 98] = encoded_control[ 49];
   assign decoded_control[ 99] = encoded_control[ 49];
   assign decoded_control[100] = encoded_control[ 50];
   assign decoded_control[101] = encoded_control[ 50];
   assign decoded_control[102] = encoded_control[ 51];
   assign decoded_control[103] = encoded_control[ 51];
   assign decoded_control[104] = encoded_control[ 52];
   assign decoded_control[105] = encoded_control[ 52];
   assign decoded_control[106] = encoded_control[ 53];
   assign decoded_control[107] = encoded_control[ 53];
   assign decoded_control[108] = encoded_control[ 54];
   assign decoded_control[109] = encoded_control[ 54];
   assign decoded_control[110] = encoded_control[ 55];
   assign decoded_control[111] = encoded_control[ 55];
   assign decoded_control[112] = encoded_control[ 56];
   assign decoded_control[113] = encoded_control[ 56];
   assign decoded_control[114] = encoded_control[ 57];
   assign decoded_control[115] = encoded_control[ 57];
   assign decoded_control[116] = encoded_control[ 58];
   assign decoded_control[117] = encoded_control[ 58];
   assign decoded_control[118] = encoded_control[ 59];
   assign decoded_control[119] = encoded_control[ 59];
   assign decoded_control[120] = encoded_control[ 60];
   assign decoded_control[121] = encoded_control[ 60];
   assign decoded_control[122] = encoded_control[ 61];
   assign decoded_control[123] = encoded_control[ 61];
   assign decoded_control[124] = encoded_control[ 62];
   assign decoded_control[125] = encoded_control[ 62];
   assign decoded_control[126] = encoded_control[ 63];
   assign decoded_control[127] = encoded_control[ 63];
   assign decoded_control[128] = encoded_control[ 64];
   assign decoded_control[129] = encoded_control[ 64];
   assign decoded_control[130] = encoded_control[ 65];
   assign decoded_control[131] = encoded_control[ 65];
   assign decoded_control[132] = encoded_control[ 66];
   assign decoded_control[133] = encoded_control[ 66];
   assign decoded_control[134] = encoded_control[ 67];
   assign decoded_control[135] = encoded_control[ 67];
   assign decoded_control[136] = encoded_control[ 68];
   assign decoded_control[137] = encoded_control[ 68];
   assign decoded_control[138] = encoded_control[ 69];
   assign decoded_control[139] = encoded_control[ 69];
   assign decoded_control[140] = encoded_control[ 70];
   assign decoded_control[141] = encoded_control[ 70];
   assign decoded_control[142] = encoded_control[ 71];
   assign decoded_control[143] = encoded_control[ 71];
   assign decoded_control[144] = encoded_control[ 72];
   assign decoded_control[145] = encoded_control[ 72];
   assign decoded_control[146] = encoded_control[ 73];
   assign decoded_control[147] = encoded_control[ 73];
   assign decoded_control[148] = encoded_control[ 74];
   assign decoded_control[149] = encoded_control[ 74];
   assign decoded_control[150] = encoded_control[ 75];
   assign decoded_control[151] = encoded_control[ 75];
   assign decoded_control[152] = encoded_control[ 76];
   assign decoded_control[153] = encoded_control[ 76];
   assign decoded_control[154] = encoded_control[ 77];
   assign decoded_control[155] = encoded_control[ 77];
   assign decoded_control[156] = encoded_control[ 78];
   assign decoded_control[157] = encoded_control[ 78];
   assign decoded_control[158] = encoded_control[ 79];
   assign decoded_control[159] = encoded_control[ 79];
   assign decoded_control[160] = encoded_control[ 80];
   assign decoded_control[161] = encoded_control[ 80];
   assign decoded_control[162] = encoded_control[ 81];
   assign decoded_control[163] = encoded_control[ 81];
   assign decoded_control[164] = encoded_control[ 82];
   assign decoded_control[165] = encoded_control[ 82];
   assign decoded_control[166] = encoded_control[ 83];
   assign decoded_control[167] = encoded_control[ 83];
   assign decoded_control[168] = encoded_control[ 84];
   assign decoded_control[169] = encoded_control[ 84];
   assign decoded_control[170] = encoded_control[ 85];
   assign decoded_control[171] = encoded_control[ 85];
   assign decoded_control[172] = encoded_control[ 86];
   assign decoded_control[173] = encoded_control[ 86];
   assign decoded_control[174] = encoded_control[ 87];
   assign decoded_control[175] = encoded_control[ 87];
   assign decoded_control[176] = encoded_control[ 88];
   assign decoded_control[177] = encoded_control[ 88];
   assign decoded_control[178] = encoded_control[ 89];
   assign decoded_control[179] = encoded_control[ 89];
   assign decoded_control[180] = encoded_control[ 90];
   assign decoded_control[181] = encoded_control[ 90];
   assign decoded_control[182] = encoded_control[ 91];
   assign decoded_control[183] = encoded_control[ 91];
   assign decoded_control[184] = encoded_control[ 92];
   assign decoded_control[185] = encoded_control[ 92];
   assign decoded_control[186] = encoded_control[ 93];
   assign decoded_control[187] = encoded_control[ 93];
   assign decoded_control[188] = encoded_control[ 94];
   assign decoded_control[189] = encoded_control[ 94];
   assign decoded_control[190] = encoded_control[ 95];
   assign decoded_control[191] = encoded_control[ 95];
   assign decoded_control[192] = encoded_control[ 96];
   assign decoded_control[193] = encoded_control[ 96];
   assign decoded_control[194] = encoded_control[ 97];
   assign decoded_control[195] = encoded_control[ 97];
   assign decoded_control[196] = encoded_control[ 98];
   assign decoded_control[197] = encoded_control[ 98];
   assign decoded_control[198] = encoded_control[ 99];
   assign decoded_control[199] = encoded_control[ 99];
   assign decoded_control[200] = encoded_control[100];
   assign decoded_control[201] = encoded_control[100];
   assign decoded_control[202] = encoded_control[101];
   assign decoded_control[203] = encoded_control[101];
   assign decoded_control[204] = encoded_control[102];
   assign decoded_control[205] = encoded_control[102];
   assign decoded_control[206] = encoded_control[103];
   assign decoded_control[207] = encoded_control[103];
   assign decoded_control[208] = encoded_control[104];
   assign decoded_control[209] = encoded_control[104];
   assign decoded_control[210] = encoded_control[105];
   assign decoded_control[211] = encoded_control[105];
   assign decoded_control[212] = encoded_control[106];
   assign decoded_control[213] = encoded_control[106];
   assign decoded_control[214] = encoded_control[107];
   assign decoded_control[215] = encoded_control[107];
   assign decoded_control[216] = encoded_control[108];
   assign decoded_control[217] = encoded_control[108];
   assign decoded_control[218] = encoded_control[109];
   assign decoded_control[219] = encoded_control[109];
   assign decoded_control[220] = encoded_control[110];
   assign decoded_control[221] = encoded_control[110];
   assign decoded_control[222] = encoded_control[111];
   assign decoded_control[223] = encoded_control[111];
   assign decoded_control[224] = encoded_control[112];
   assign decoded_control[225] = encoded_control[112];
   assign decoded_control[226] = encoded_control[113];
   assign decoded_control[227] = encoded_control[113];
   assign decoded_control[228] = encoded_control[114];
   assign decoded_control[229] = encoded_control[114];
   assign decoded_control[230] = encoded_control[115];
   assign decoded_control[231] = encoded_control[115];
   assign decoded_control[232] = encoded_control[116];
   assign decoded_control[233] = encoded_control[116];
   assign decoded_control[234] = encoded_control[117];
   assign decoded_control[235] = encoded_control[117];
   assign decoded_control[236] = encoded_control[118];
   assign decoded_control[237] = encoded_control[118];
   assign decoded_control[238] = encoded_control[119];
   assign decoded_control[239] = encoded_control[119];
   assign decoded_control[240] = encoded_control[120];
   assign decoded_control[241] = encoded_control[120];
   assign decoded_control[242] = encoded_control[121];
   assign decoded_control[243] = encoded_control[122];
   assign decoded_control[244] = encoded_control[123];
   assign decoded_control[245] = encoded_control[124];
endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_low_power_shift_controller (
   input  wire         edt_clock,
   input  wire         edt_update,
   input  wire         edt_low_power_shift_en,
   input  wire [  1:0] edt_channels_in,
   input  wire [245:0] edt_decompressor_out,
   output wire [  1:0] edt_channels_out_from_low_power_shift_control,
   output wire [245:0] edt_scan_in
);
   reg    [ 62:0] low_power_shift_reg_0;
   reg    [ 61:0] low_power_shift_reg_1;
   reg    [ 62:0] low_power_hold_reg_0;
   reg    [ 61:0] low_power_hold_reg_1;
   wire   [124:0] encoded_control;
   wire   [245:0] bias_inputs;
   wire           low_power_shift_reg_sync_reset;
   wire           low_power_hold_reg_sync_set;

   assign low_power_shift_reg_sync_reset = edt_update;

   // synopsys sync_set_reset low_power_shift_reg_sync_reset
   always @(posedge edt_clock)
   begin : shift_low_power_regs
      if (low_power_shift_reg_sync_reset == 1'b1) begin
         low_power_shift_reg_0 <= 63'b000000000000000000000000000000000000000000000000000000000000000;
         low_power_shift_reg_1 <= 62'b00000000000000000000000000000000000000000000000000000000000000;
      end
      else begin
         low_power_shift_reg_0 <= {edt_channels_in[0], low_power_shift_reg_0[62:1]};
         low_power_shift_reg_1 <= {edt_channels_in[1], low_power_shift_reg_1[61:1]};
      end
   end

   assign low_power_hold_reg_sync_set = edt_update & ~edt_low_power_shift_en;

   // synopsys sync_set_reset low_power_hold_reg_sync_set
   always @(posedge edt_clock)
   begin : update_low_power_regs
      if (low_power_hold_reg_sync_set == 1'b1) begin
         low_power_hold_reg_0 <= 63'b111111111111111111111111111111111111111111111111111111111111111;
         low_power_hold_reg_1 <= 62'b11111111111111111111111111111111111111111111111111111111111111;
      end
      else begin
         if (edt_update == 1'b1) begin
            low_power_hold_reg_0 <= low_power_shift_reg_0;
            low_power_hold_reg_1 <= low_power_shift_reg_1;
         end
      end
   end

   assign edt_channels_out_from_low_power_shift_control[0] = edt_low_power_shift_en ? low_power_shift_reg_0[0] : edt_channels_in[0];
   assign edt_channels_out_from_low_power_shift_control[1] = edt_low_power_shift_en ? low_power_shift_reg_1[0] : edt_channels_in[1];

   assign encoded_control = {low_power_hold_reg_1[61], low_power_hold_reg_1[60], low_power_hold_reg_1[59], 
                             low_power_hold_reg_1[58], low_power_hold_reg_1[57], low_power_hold_reg_1[56], 
                             low_power_hold_reg_1[55], low_power_hold_reg_1[54], low_power_hold_reg_1[53], 
                             low_power_hold_reg_1[52], low_power_hold_reg_1[51], low_power_hold_reg_1[50], 
                             low_power_hold_reg_1[49], low_power_hold_reg_1[48], low_power_hold_reg_1[47], 
                             low_power_hold_reg_1[46], low_power_hold_reg_1[45], low_power_hold_reg_1[44], 
                             low_power_hold_reg_1[43], low_power_hold_reg_1[42], low_power_hold_reg_1[41], 
                             low_power_hold_reg_1[40], low_power_hold_reg_1[39], low_power_hold_reg_1[38], 
                             low_power_hold_reg_1[37], low_power_hold_reg_1[36], low_power_hold_reg_1[35], 
                             low_power_hold_reg_1[34], low_power_hold_reg_1[33], low_power_hold_reg_1[32], 
                             low_power_hold_reg_1[31], low_power_hold_reg_1[30], low_power_hold_reg_1[29], 
                             low_power_hold_reg_1[28], low_power_hold_reg_1[27], low_power_hold_reg_1[26], 
                             low_power_hold_reg_1[25], low_power_hold_reg_1[24], low_power_hold_reg_1[23], 
                             low_power_hold_reg_1[22], low_power_hold_reg_1[21], low_power_hold_reg_1[20], 
                             low_power_hold_reg_1[19], low_power_hold_reg_1[18], low_power_hold_reg_1[17], 
                             low_power_hold_reg_1[16], low_power_hold_reg_1[15], low_power_hold_reg_1[14], 
                             low_power_hold_reg_1[13], low_power_hold_reg_1[12], low_power_hold_reg_1[11], 
                             low_power_hold_reg_1[10], low_power_hold_reg_1[9], low_power_hold_reg_1[8], 
                             low_power_hold_reg_1[7], low_power_hold_reg_1[6], low_power_hold_reg_1[5], 
                             low_power_hold_reg_1[4], low_power_hold_reg_1[3], low_power_hold_reg_1[2], 
                             low_power_hold_reg_1[1], low_power_hold_reg_1[0], low_power_hold_reg_0[62], 
                             low_power_hold_reg_0[61], low_power_hold_reg_0[60], low_power_hold_reg_0[59], 
                             low_power_hold_reg_0[58], low_power_hold_reg_0[57], low_power_hold_reg_0[56], 
                             low_power_hold_reg_0[55], low_power_hold_reg_0[54], low_power_hold_reg_0[53], 
                             low_power_hold_reg_0[52], low_power_hold_reg_0[51], low_power_hold_reg_0[50], 
                             low_power_hold_reg_0[49], low_power_hold_reg_0[48], low_power_hold_reg_0[47], 
                             low_power_hold_reg_0[46], low_power_hold_reg_0[45], low_power_hold_reg_0[44], 
                             low_power_hold_reg_0[43], low_power_hold_reg_0[42], low_power_hold_reg_0[41], 
                             low_power_hold_reg_0[40], low_power_hold_reg_0[39], low_power_hold_reg_0[38], 
                             low_power_hold_reg_0[37], low_power_hold_reg_0[36], low_power_hold_reg_0[35], 
                             low_power_hold_reg_0[34], low_power_hold_reg_0[33], low_power_hold_reg_0[32], 
                             low_power_hold_reg_0[31], low_power_hold_reg_0[30], low_power_hold_reg_0[29], 
                             low_power_hold_reg_0[28], low_power_hold_reg_0[27], low_power_hold_reg_0[26], 
                             low_power_hold_reg_0[25], low_power_hold_reg_0[24], low_power_hold_reg_0[23], 
                             low_power_hold_reg_0[22], low_power_hold_reg_0[21], low_power_hold_reg_0[20], 
                             low_power_hold_reg_0[19], low_power_hold_reg_0[18], low_power_hold_reg_0[17], 
                             low_power_hold_reg_0[16], low_power_hold_reg_0[15], low_power_hold_reg_0[14], 
                             low_power_hold_reg_0[13], low_power_hold_reg_0[12], low_power_hold_reg_0[11], 
                             low_power_hold_reg_0[10], low_power_hold_reg_0[9], low_power_hold_reg_0[8], 
                             low_power_hold_reg_0[7], low_power_hold_reg_0[6], low_power_hold_reg_0[5], 
                             low_power_hold_reg_0[4], low_power_hold_reg_0[3], low_power_hold_reg_0[2], 
                             low_power_hold_reg_0[1], low_power_hold_reg_0[0]};

   processor_core_logic_test_tessent_edt_EXT_EDT_low_power_shift_decoder decoder (
      .encoded_control(encoded_control),
      .decoded_control(bias_inputs));

   assign edt_scan_in[  0] = edt_decompressor_out[  0] & bias_inputs[  0];
   assign edt_scan_in[  1] = edt_decompressor_out[  1] & bias_inputs[  1];
   assign edt_scan_in[  2] = edt_decompressor_out[  2] & bias_inputs[  2];
   assign edt_scan_in[  3] = edt_decompressor_out[  3] & bias_inputs[  3];
   assign edt_scan_in[  4] = edt_decompressor_out[  4] & bias_inputs[  4];
   assign edt_scan_in[  5] = edt_decompressor_out[  5] & bias_inputs[  5];
   assign edt_scan_in[  6] = edt_decompressor_out[  6] & bias_inputs[  6];
   assign edt_scan_in[  7] = edt_decompressor_out[  7] & bias_inputs[  7];
   assign edt_scan_in[  8] = edt_decompressor_out[  8] & bias_inputs[  8];
   assign edt_scan_in[  9] = edt_decompressor_out[  9] & bias_inputs[  9];
   assign edt_scan_in[ 10] = edt_decompressor_out[ 10] & bias_inputs[ 10];
   assign edt_scan_in[ 11] = edt_decompressor_out[ 11] & bias_inputs[ 11];
   assign edt_scan_in[ 12] = edt_decompressor_out[ 12] & bias_inputs[ 12];
   assign edt_scan_in[ 13] = edt_decompressor_out[ 13] & bias_inputs[ 13];
   assign edt_scan_in[ 14] = edt_decompressor_out[ 14] & bias_inputs[ 14];
   assign edt_scan_in[ 15] = edt_decompressor_out[ 15] & bias_inputs[ 15];
   assign edt_scan_in[ 16] = edt_decompressor_out[ 16] & bias_inputs[ 16];
   assign edt_scan_in[ 17] = edt_decompressor_out[ 17] & bias_inputs[ 17];
   assign edt_scan_in[ 18] = edt_decompressor_out[ 18] & bias_inputs[ 18];
   assign edt_scan_in[ 19] = edt_decompressor_out[ 19] & bias_inputs[ 19];
   assign edt_scan_in[ 20] = edt_decompressor_out[ 20] & bias_inputs[ 20];
   assign edt_scan_in[ 21] = edt_decompressor_out[ 21] & bias_inputs[ 21];
   assign edt_scan_in[ 22] = edt_decompressor_out[ 22] & bias_inputs[ 22];
   assign edt_scan_in[ 23] = edt_decompressor_out[ 23] & bias_inputs[ 23];
   assign edt_scan_in[ 24] = edt_decompressor_out[ 24] & bias_inputs[ 24];
   assign edt_scan_in[ 25] = edt_decompressor_out[ 25] & bias_inputs[ 25];
   assign edt_scan_in[ 26] = edt_decompressor_out[ 26] & bias_inputs[ 26];
   assign edt_scan_in[ 27] = edt_decompressor_out[ 27] & bias_inputs[ 27];
   assign edt_scan_in[ 28] = edt_decompressor_out[ 28] & bias_inputs[ 28];
   assign edt_scan_in[ 29] = edt_decompressor_out[ 29] & bias_inputs[ 29];
   assign edt_scan_in[ 30] = edt_decompressor_out[ 30] & bias_inputs[ 30];
   assign edt_scan_in[ 31] = edt_decompressor_out[ 31] & bias_inputs[ 31];
   assign edt_scan_in[ 32] = edt_decompressor_out[ 32] & bias_inputs[ 32];
   assign edt_scan_in[ 33] = edt_decompressor_out[ 33] & bias_inputs[ 33];
   assign edt_scan_in[ 34] = edt_decompressor_out[ 34] & bias_inputs[ 34];
   assign edt_scan_in[ 35] = edt_decompressor_out[ 35] & bias_inputs[ 35];
   assign edt_scan_in[ 36] = edt_decompressor_out[ 36] & bias_inputs[ 36];
   assign edt_scan_in[ 37] = edt_decompressor_out[ 37] & bias_inputs[ 37];
   assign edt_scan_in[ 38] = edt_decompressor_out[ 38] & bias_inputs[ 38];
   assign edt_scan_in[ 39] = edt_decompressor_out[ 39] & bias_inputs[ 39];
   assign edt_scan_in[ 40] = edt_decompressor_out[ 40] & bias_inputs[ 40];
   assign edt_scan_in[ 41] = edt_decompressor_out[ 41] & bias_inputs[ 41];
   assign edt_scan_in[ 42] = edt_decompressor_out[ 42] & bias_inputs[ 42];
   assign edt_scan_in[ 43] = edt_decompressor_out[ 43] & bias_inputs[ 43];
   assign edt_scan_in[ 44] = edt_decompressor_out[ 44] & bias_inputs[ 44];
   assign edt_scan_in[ 45] = edt_decompressor_out[ 45] & bias_inputs[ 45];
   assign edt_scan_in[ 46] = edt_decompressor_out[ 46] & bias_inputs[ 46];
   assign edt_scan_in[ 47] = edt_decompressor_out[ 47] & bias_inputs[ 47];
   assign edt_scan_in[ 48] = edt_decompressor_out[ 48] & bias_inputs[ 48];
   assign edt_scan_in[ 49] = edt_decompressor_out[ 49] & bias_inputs[ 49];
   assign edt_scan_in[ 50] = edt_decompressor_out[ 50] & bias_inputs[ 50];
   assign edt_scan_in[ 51] = edt_decompressor_out[ 51] & bias_inputs[ 51];
   assign edt_scan_in[ 52] = edt_decompressor_out[ 52] & bias_inputs[ 52];
   assign edt_scan_in[ 53] = edt_decompressor_out[ 53] & bias_inputs[ 53];
   assign edt_scan_in[ 54] = edt_decompressor_out[ 54] & bias_inputs[ 54];
   assign edt_scan_in[ 55] = edt_decompressor_out[ 55] & bias_inputs[ 55];
   assign edt_scan_in[ 56] = edt_decompressor_out[ 56] & bias_inputs[ 56];
   assign edt_scan_in[ 57] = edt_decompressor_out[ 57] & bias_inputs[ 57];
   assign edt_scan_in[ 58] = edt_decompressor_out[ 58] & bias_inputs[ 58];
   assign edt_scan_in[ 59] = edt_decompressor_out[ 59] & bias_inputs[ 59];
   assign edt_scan_in[ 60] = edt_decompressor_out[ 60] & bias_inputs[ 60];
   assign edt_scan_in[ 61] = edt_decompressor_out[ 61] & bias_inputs[ 61];
   assign edt_scan_in[ 62] = edt_decompressor_out[ 62] & bias_inputs[ 62];
   assign edt_scan_in[ 63] = edt_decompressor_out[ 63] & bias_inputs[ 63];
   assign edt_scan_in[ 64] = edt_decompressor_out[ 64] & bias_inputs[ 64];
   assign edt_scan_in[ 65] = edt_decompressor_out[ 65] & bias_inputs[ 65];
   assign edt_scan_in[ 66] = edt_decompressor_out[ 66] & bias_inputs[ 66];
   assign edt_scan_in[ 67] = edt_decompressor_out[ 67] & bias_inputs[ 67];
   assign edt_scan_in[ 68] = edt_decompressor_out[ 68] & bias_inputs[ 68];
   assign edt_scan_in[ 69] = edt_decompressor_out[ 69] & bias_inputs[ 69];
   assign edt_scan_in[ 70] = edt_decompressor_out[ 70] & bias_inputs[ 70];
   assign edt_scan_in[ 71] = edt_decompressor_out[ 71] & bias_inputs[ 71];
   assign edt_scan_in[ 72] = edt_decompressor_out[ 72] & bias_inputs[ 72];
   assign edt_scan_in[ 73] = edt_decompressor_out[ 73] & bias_inputs[ 73];
   assign edt_scan_in[ 74] = edt_decompressor_out[ 74] & bias_inputs[ 74];
   assign edt_scan_in[ 75] = edt_decompressor_out[ 75] & bias_inputs[ 75];
   assign edt_scan_in[ 76] = edt_decompressor_out[ 76] & bias_inputs[ 76];
   assign edt_scan_in[ 77] = edt_decompressor_out[ 77] & bias_inputs[ 77];
   assign edt_scan_in[ 78] = edt_decompressor_out[ 78] & bias_inputs[ 78];
   assign edt_scan_in[ 79] = edt_decompressor_out[ 79] & bias_inputs[ 79];
   assign edt_scan_in[ 80] = edt_decompressor_out[ 80] & bias_inputs[ 80];
   assign edt_scan_in[ 81] = edt_decompressor_out[ 81] & bias_inputs[ 81];
   assign edt_scan_in[ 82] = edt_decompressor_out[ 82] & bias_inputs[ 82];
   assign edt_scan_in[ 83] = edt_decompressor_out[ 83] & bias_inputs[ 83];
   assign edt_scan_in[ 84] = edt_decompressor_out[ 84] & bias_inputs[ 84];
   assign edt_scan_in[ 85] = edt_decompressor_out[ 85] & bias_inputs[ 85];
   assign edt_scan_in[ 86] = edt_decompressor_out[ 86] & bias_inputs[ 86];
   assign edt_scan_in[ 87] = edt_decompressor_out[ 87] & bias_inputs[ 87];
   assign edt_scan_in[ 88] = edt_decompressor_out[ 88] & bias_inputs[ 88];
   assign edt_scan_in[ 89] = edt_decompressor_out[ 89] & bias_inputs[ 89];
   assign edt_scan_in[ 90] = edt_decompressor_out[ 90] & bias_inputs[ 90];
   assign edt_scan_in[ 91] = edt_decompressor_out[ 91] & bias_inputs[ 91];
   assign edt_scan_in[ 92] = edt_decompressor_out[ 92] & bias_inputs[ 92];
   assign edt_scan_in[ 93] = edt_decompressor_out[ 93] & bias_inputs[ 93];
   assign edt_scan_in[ 94] = edt_decompressor_out[ 94] & bias_inputs[ 94];
   assign edt_scan_in[ 95] = edt_decompressor_out[ 95] & bias_inputs[ 95];
   assign edt_scan_in[ 96] = edt_decompressor_out[ 96] & bias_inputs[ 96];
   assign edt_scan_in[ 97] = edt_decompressor_out[ 97] & bias_inputs[ 97];
   assign edt_scan_in[ 98] = edt_decompressor_out[ 98] & bias_inputs[ 98];
   assign edt_scan_in[ 99] = edt_decompressor_out[ 99] & bias_inputs[ 99];
   assign edt_scan_in[100] = edt_decompressor_out[100] & bias_inputs[100];
   assign edt_scan_in[101] = edt_decompressor_out[101] & bias_inputs[101];
   assign edt_scan_in[102] = edt_decompressor_out[102] & bias_inputs[102];
   assign edt_scan_in[103] = edt_decompressor_out[103] & bias_inputs[103];
   assign edt_scan_in[104] = edt_decompressor_out[104] & bias_inputs[104];
   assign edt_scan_in[105] = edt_decompressor_out[105] & bias_inputs[105];
   assign edt_scan_in[106] = edt_decompressor_out[106] & bias_inputs[106];
   assign edt_scan_in[107] = edt_decompressor_out[107] & bias_inputs[107];
   assign edt_scan_in[108] = edt_decompressor_out[108] & bias_inputs[108];
   assign edt_scan_in[109] = edt_decompressor_out[109] & bias_inputs[109];
   assign edt_scan_in[110] = edt_decompressor_out[110] & bias_inputs[110];
   assign edt_scan_in[111] = edt_decompressor_out[111] & bias_inputs[111];
   assign edt_scan_in[112] = edt_decompressor_out[112] & bias_inputs[112];
   assign edt_scan_in[113] = edt_decompressor_out[113] & bias_inputs[113];
   assign edt_scan_in[114] = edt_decompressor_out[114] & bias_inputs[114];
   assign edt_scan_in[115] = edt_decompressor_out[115] & bias_inputs[115];
   assign edt_scan_in[116] = edt_decompressor_out[116] & bias_inputs[116];
   assign edt_scan_in[117] = edt_decompressor_out[117] & bias_inputs[117];
   assign edt_scan_in[118] = edt_decompressor_out[118] & bias_inputs[118];
   assign edt_scan_in[119] = edt_decompressor_out[119] & bias_inputs[119];
   assign edt_scan_in[120] = edt_decompressor_out[120] & bias_inputs[120];
   assign edt_scan_in[121] = edt_decompressor_out[121] & bias_inputs[121];
   assign edt_scan_in[122] = edt_decompressor_out[122] & bias_inputs[122];
   assign edt_scan_in[123] = edt_decompressor_out[123] & bias_inputs[123];
   assign edt_scan_in[124] = edt_decompressor_out[124] & bias_inputs[124];
   assign edt_scan_in[125] = edt_decompressor_out[125] & bias_inputs[125];
   assign edt_scan_in[126] = edt_decompressor_out[126] & bias_inputs[126];
   assign edt_scan_in[127] = edt_decompressor_out[127] & bias_inputs[127];
   assign edt_scan_in[128] = edt_decompressor_out[128] & bias_inputs[128];
   assign edt_scan_in[129] = edt_decompressor_out[129] & bias_inputs[129];
   assign edt_scan_in[130] = edt_decompressor_out[130] & bias_inputs[130];
   assign edt_scan_in[131] = edt_decompressor_out[131] & bias_inputs[131];
   assign edt_scan_in[132] = edt_decompressor_out[132] & bias_inputs[132];
   assign edt_scan_in[133] = edt_decompressor_out[133] & bias_inputs[133];
   assign edt_scan_in[134] = edt_decompressor_out[134] & bias_inputs[134];
   assign edt_scan_in[135] = edt_decompressor_out[135] & bias_inputs[135];
   assign edt_scan_in[136] = edt_decompressor_out[136] & bias_inputs[136];
   assign edt_scan_in[137] = edt_decompressor_out[137] & bias_inputs[137];
   assign edt_scan_in[138] = edt_decompressor_out[138] & bias_inputs[138];
   assign edt_scan_in[139] = edt_decompressor_out[139] & bias_inputs[139];
   assign edt_scan_in[140] = edt_decompressor_out[140] & bias_inputs[140];
   assign edt_scan_in[141] = edt_decompressor_out[141] & bias_inputs[141];
   assign edt_scan_in[142] = edt_decompressor_out[142] & bias_inputs[142];
   assign edt_scan_in[143] = edt_decompressor_out[143] & bias_inputs[143];
   assign edt_scan_in[144] = edt_decompressor_out[144] & bias_inputs[144];
   assign edt_scan_in[145] = edt_decompressor_out[145] & bias_inputs[145];
   assign edt_scan_in[146] = edt_decompressor_out[146] & bias_inputs[146];
   assign edt_scan_in[147] = edt_decompressor_out[147] & bias_inputs[147];
   assign edt_scan_in[148] = edt_decompressor_out[148] & bias_inputs[148];
   assign edt_scan_in[149] = edt_decompressor_out[149] & bias_inputs[149];
   assign edt_scan_in[150] = edt_decompressor_out[150] & bias_inputs[150];
   assign edt_scan_in[151] = edt_decompressor_out[151] & bias_inputs[151];
   assign edt_scan_in[152] = edt_decompressor_out[152] & bias_inputs[152];
   assign edt_scan_in[153] = edt_decompressor_out[153] & bias_inputs[153];
   assign edt_scan_in[154] = edt_decompressor_out[154] & bias_inputs[154];
   assign edt_scan_in[155] = edt_decompressor_out[155] & bias_inputs[155];
   assign edt_scan_in[156] = edt_decompressor_out[156] & bias_inputs[156];
   assign edt_scan_in[157] = edt_decompressor_out[157] & bias_inputs[157];
   assign edt_scan_in[158] = edt_decompressor_out[158] & bias_inputs[158];
   assign edt_scan_in[159] = edt_decompressor_out[159] & bias_inputs[159];
   assign edt_scan_in[160] = edt_decompressor_out[160] & bias_inputs[160];
   assign edt_scan_in[161] = edt_decompressor_out[161] & bias_inputs[161];
   assign edt_scan_in[162] = edt_decompressor_out[162] & bias_inputs[162];
   assign edt_scan_in[163] = edt_decompressor_out[163] & bias_inputs[163];
   assign edt_scan_in[164] = edt_decompressor_out[164] & bias_inputs[164];
   assign edt_scan_in[165] = edt_decompressor_out[165] & bias_inputs[165];
   assign edt_scan_in[166] = edt_decompressor_out[166] & bias_inputs[166];
   assign edt_scan_in[167] = edt_decompressor_out[167] & bias_inputs[167];
   assign edt_scan_in[168] = edt_decompressor_out[168] & bias_inputs[168];
   assign edt_scan_in[169] = edt_decompressor_out[169] & bias_inputs[169];
   assign edt_scan_in[170] = edt_decompressor_out[170] & bias_inputs[170];
   assign edt_scan_in[171] = edt_decompressor_out[171] & bias_inputs[171];
   assign edt_scan_in[172] = edt_decompressor_out[172] & bias_inputs[172];
   assign edt_scan_in[173] = edt_decompressor_out[173] & bias_inputs[173];
   assign edt_scan_in[174] = edt_decompressor_out[174] & bias_inputs[174];
   assign edt_scan_in[175] = edt_decompressor_out[175] & bias_inputs[175];
   assign edt_scan_in[176] = edt_decompressor_out[176] & bias_inputs[176];
   assign edt_scan_in[177] = edt_decompressor_out[177] & bias_inputs[177];
   assign edt_scan_in[178] = edt_decompressor_out[178] & bias_inputs[178];
   assign edt_scan_in[179] = edt_decompressor_out[179] & bias_inputs[179];
   assign edt_scan_in[180] = edt_decompressor_out[180] & bias_inputs[180];
   assign edt_scan_in[181] = edt_decompressor_out[181] & bias_inputs[181];
   assign edt_scan_in[182] = edt_decompressor_out[182] & bias_inputs[182];
   assign edt_scan_in[183] = edt_decompressor_out[183] & bias_inputs[183];
   assign edt_scan_in[184] = edt_decompressor_out[184] & bias_inputs[184];
   assign edt_scan_in[185] = edt_decompressor_out[185] & bias_inputs[185];
   assign edt_scan_in[186] = edt_decompressor_out[186] & bias_inputs[186];
   assign edt_scan_in[187] = edt_decompressor_out[187] & bias_inputs[187];
   assign edt_scan_in[188] = edt_decompressor_out[188] & bias_inputs[188];
   assign edt_scan_in[189] = edt_decompressor_out[189] & bias_inputs[189];
   assign edt_scan_in[190] = edt_decompressor_out[190] & bias_inputs[190];
   assign edt_scan_in[191] = edt_decompressor_out[191] & bias_inputs[191];
   assign edt_scan_in[192] = edt_decompressor_out[192] & bias_inputs[192];
   assign edt_scan_in[193] = edt_decompressor_out[193] & bias_inputs[193];
   assign edt_scan_in[194] = edt_decompressor_out[194] & bias_inputs[194];
   assign edt_scan_in[195] = edt_decompressor_out[195] & bias_inputs[195];
   assign edt_scan_in[196] = edt_decompressor_out[196] & bias_inputs[196];
   assign edt_scan_in[197] = edt_decompressor_out[197] & bias_inputs[197];
   assign edt_scan_in[198] = edt_decompressor_out[198] & bias_inputs[198];
   assign edt_scan_in[199] = edt_decompressor_out[199] & bias_inputs[199];
   assign edt_scan_in[200] = edt_decompressor_out[200] & bias_inputs[200];
   assign edt_scan_in[201] = edt_decompressor_out[201] & bias_inputs[201];
   assign edt_scan_in[202] = edt_decompressor_out[202] & bias_inputs[202];
   assign edt_scan_in[203] = edt_decompressor_out[203] & bias_inputs[203];
   assign edt_scan_in[204] = edt_decompressor_out[204] & bias_inputs[204];
   assign edt_scan_in[205] = edt_decompressor_out[205] & bias_inputs[205];
   assign edt_scan_in[206] = edt_decompressor_out[206] & bias_inputs[206];
   assign edt_scan_in[207] = edt_decompressor_out[207] & bias_inputs[207];
   assign edt_scan_in[208] = edt_decompressor_out[208] & bias_inputs[208];
   assign edt_scan_in[209] = edt_decompressor_out[209] & bias_inputs[209];
   assign edt_scan_in[210] = edt_decompressor_out[210] & bias_inputs[210];
   assign edt_scan_in[211] = edt_decompressor_out[211] & bias_inputs[211];
   assign edt_scan_in[212] = edt_decompressor_out[212] & bias_inputs[212];
   assign edt_scan_in[213] = edt_decompressor_out[213] & bias_inputs[213];
   assign edt_scan_in[214] = edt_decompressor_out[214] & bias_inputs[214];
   assign edt_scan_in[215] = edt_decompressor_out[215] & bias_inputs[215];
   assign edt_scan_in[216] = edt_decompressor_out[216] & bias_inputs[216];
   assign edt_scan_in[217] = edt_decompressor_out[217] & bias_inputs[217];
   assign edt_scan_in[218] = edt_decompressor_out[218] & bias_inputs[218];
   assign edt_scan_in[219] = edt_decompressor_out[219] & bias_inputs[219];
   assign edt_scan_in[220] = edt_decompressor_out[220] & bias_inputs[220];
   assign edt_scan_in[221] = edt_decompressor_out[221] & bias_inputs[221];
   assign edt_scan_in[222] = edt_decompressor_out[222] & bias_inputs[222];
   assign edt_scan_in[223] = edt_decompressor_out[223] & bias_inputs[223];
   assign edt_scan_in[224] = edt_decompressor_out[224] & bias_inputs[224];
   assign edt_scan_in[225] = edt_decompressor_out[225] & bias_inputs[225];
   assign edt_scan_in[226] = edt_decompressor_out[226] & bias_inputs[226];
   assign edt_scan_in[227] = edt_decompressor_out[227] & bias_inputs[227];
   assign edt_scan_in[228] = edt_decompressor_out[228] & bias_inputs[228];
   assign edt_scan_in[229] = edt_decompressor_out[229] & bias_inputs[229];
   assign edt_scan_in[230] = edt_decompressor_out[230] & bias_inputs[230];
   assign edt_scan_in[231] = edt_decompressor_out[231] & bias_inputs[231];
   assign edt_scan_in[232] = edt_decompressor_out[232] & bias_inputs[232];
   assign edt_scan_in[233] = edt_decompressor_out[233] & bias_inputs[233];
   assign edt_scan_in[234] = edt_decompressor_out[234] & bias_inputs[234];
   assign edt_scan_in[235] = edt_decompressor_out[235] & bias_inputs[235];
   assign edt_scan_in[236] = edt_decompressor_out[236] & bias_inputs[236];
   assign edt_scan_in[237] = edt_decompressor_out[237] & bias_inputs[237];
   assign edt_scan_in[238] = edt_decompressor_out[238] & bias_inputs[238];
   assign edt_scan_in[239] = edt_decompressor_out[239] & bias_inputs[239];
   assign edt_scan_in[240] = edt_decompressor_out[240] & bias_inputs[240];
   assign edt_scan_in[241] = edt_decompressor_out[241] & bias_inputs[241];
   assign edt_scan_in[242] = edt_decompressor_out[242] & bias_inputs[242];
   assign edt_scan_in[243] = edt_decompressor_out[243] & bias_inputs[243];
   assign edt_scan_in[244] = edt_decompressor_out[244] & bias_inputs[244];
   assign edt_scan_in[245] = edt_decompressor_out[245] & bias_inputs[245];
endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_onehot_decoder_7_to_123 (
   input  wire [  6:0] encoded_masks,
   output reg  [122:0] decoded_masks
);
   always @(encoded_masks)
   begin
      case (encoded_masks)
         7'b0000000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b0000001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001;
         7'b0000010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010;
         7'b0000011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100;
         7'b0000100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000;
         7'b0000101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000;
         7'b0000110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000;
         7'b0000111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000;
         7'b0001000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000;
         7'b0001001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000;
         7'b0001010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000;
         7'b0001011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000;
         7'b0001100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000;
         7'b0001101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000;
         7'b0001110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000;
         7'b0001111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000;
         7'b0010000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000;
         7'b0010001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000;
         7'b0010010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000;
         7'b0010011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000;
         7'b0010100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000;
         7'b0010101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000;
         7'b0010110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000;
         7'b0010111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000;
         7'b0011000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000;
         7'b0011001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000;
         7'b0011010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000;
         7'b0011011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000;
         7'b0011100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000;
         7'b0011101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000;
         7'b0011110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000;
         7'b0011111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000;
         7'b0100000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000;
         7'b0100001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000;
         7'b0100010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000;
         7'b0100011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000;
         7'b0100100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000;
         7'b0100101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000;
         7'b0100110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000;
         7'b0100111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000;
         7'b0101000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000;
         7'b0101001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000;
         7'b0101010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000;
         7'b0101011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000;
         7'b0101100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000;
         7'b0101101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000;
         7'b0101110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000;
         7'b0101111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000;
         7'b0110000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000;
         7'b0110001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000;
         7'b0110010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000;
         7'b0110011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000;
         7'b0110100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000;
         7'b0110101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000;
         7'b0110110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000;
         7'b0110111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000;
         7'b0111000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000;
         7'b0111001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000;
         7'b0111010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000;
         7'b0111011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000;
         7'b0111100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000;
         7'b0111101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000;
         7'b0111110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000;
         7'b0111111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000;
         7'b1000000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000;
         7'b1000001: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000;
         7'b1000010: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000;
         7'b1000011: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000;
         7'b1000100: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000;
         7'b1000101: decoded_masks = 123'b000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000;
         7'b1000110: decoded_masks = 123'b000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1000111: decoded_masks = 123'b000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001000: decoded_masks = 123'b000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001001: decoded_masks = 123'b000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001010: decoded_masks = 123'b000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001011: decoded_masks = 123'b000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001100: decoded_masks = 123'b000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001101: decoded_masks = 123'b000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001110: decoded_masks = 123'b000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1001111: decoded_masks = 123'b000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010000: decoded_masks = 123'b000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010001: decoded_masks = 123'b000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010010: decoded_masks = 123'b000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010011: decoded_masks = 123'b000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010100: decoded_masks = 123'b000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010101: decoded_masks = 123'b000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010110: decoded_masks = 123'b000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1010111: decoded_masks = 123'b000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011000: decoded_masks = 123'b000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011001: decoded_masks = 123'b000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011010: decoded_masks = 123'b000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011011: decoded_masks = 123'b000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011100: decoded_masks = 123'b000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011101: decoded_masks = 123'b000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011110: decoded_masks = 123'b000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1011111: decoded_masks = 123'b000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100000: decoded_masks = 123'b000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100001: decoded_masks = 123'b000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100010: decoded_masks = 123'b000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100011: decoded_masks = 123'b000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100100: decoded_masks = 123'b000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100101: decoded_masks = 123'b000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100110: decoded_masks = 123'b000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1100111: decoded_masks = 123'b000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101000: decoded_masks = 123'b000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101001: decoded_masks = 123'b000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101010: decoded_masks = 123'b000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101011: decoded_masks = 123'b000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101100: decoded_masks = 123'b000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101101: decoded_masks = 123'b000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101110: decoded_masks = 123'b000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1101111: decoded_masks = 123'b000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110000: decoded_masks = 123'b000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110001: decoded_masks = 123'b000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110010: decoded_masks = 123'b000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110011: decoded_masks = 123'b000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110100: decoded_masks = 123'b000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110101: decoded_masks = 123'b000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110110: decoded_masks = 123'b000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1110111: decoded_masks = 123'b000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1111000: decoded_masks = 123'b000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1111001: decoded_masks = 123'b001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1111010: decoded_masks = 123'b010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         7'b1111011: decoded_masks = 123'b100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
         default:    decoded_masks = 123'b111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111;
      endcase
   end
endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_xor_decoder (
   input  wire [ 25:0] encoded_masks,
   output wire [122:0] decoded_masks_0,
   output wire [122:0] decoded_masks_1
);
   assign decoded_masks_0[  0] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 2];
   assign decoded_masks_0[  1] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 3];
   assign decoded_masks_0[  2] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 4];
   assign decoded_masks_0[  3] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 5];
   assign decoded_masks_0[  4] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 6];
   assign decoded_masks_0[  5] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 7];
   assign decoded_masks_0[  6] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 8];
   assign decoded_masks_0[  7] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[ 9];
   assign decoded_masks_0[  8] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[10];
   assign decoded_masks_0[  9] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[11];
   assign decoded_masks_0[ 10] = encoded_masks[ 0] ^ encoded_masks[ 1] ^ encoded_masks[12];
   assign decoded_masks_0[ 11] = encoded_masks[ 0] ^ encoded_masks[ 2] ^ encoded_masks[ 3];
   assign decoded_masks_0[ 12] = encoded_masks[ 1] ^ encoded_masks[ 2] ^ encoded_masks[ 3];
   assign decoded_masks_0[ 13] = encoded_masks[ 3] ^ encoded_masks[ 6] ^ encoded_masks[ 7];
   assign decoded_masks_0[ 14] = encoded_masks[ 5] ^ encoded_masks[10] ^ encoded_masks[11];
   assign decoded_masks_0[ 15] = encoded_masks[ 1] ^ encoded_masks[ 4] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 16] = encoded_masks[ 0] ^ encoded_masks[ 8] ^ encoded_masks[12];
   assign decoded_masks_0[ 17] = encoded_masks[ 4] ^ encoded_masks[ 6] ^ encoded_masks[11];
   assign decoded_masks_0[ 18] = encoded_masks[ 7] ^ encoded_masks[10] ^ encoded_masks[12];
   assign decoded_masks_0[ 19] = encoded_masks[ 5] ^ encoded_masks[ 8] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 20] = encoded_masks[ 2] ^ encoded_masks[ 5] ^ encoded_masks[ 7];
   assign decoded_masks_0[ 21] = encoded_masks[ 6] ^ encoded_masks[ 9] ^ encoded_masks[12];
   assign decoded_masks_0[ 22] = encoded_masks[ 4] ^ encoded_masks[ 8] ^ encoded_masks[10];
   assign decoded_masks_0[ 23] = encoded_masks[ 2] ^ encoded_masks[ 8] ^ encoded_masks[11];
   assign decoded_masks_0[ 24] = encoded_masks[ 1] ^ encoded_masks[ 7] ^ encoded_masks[11];
   assign decoded_masks_0[ 25] = encoded_masks[ 3] ^ encoded_masks[ 4] ^ encoded_masks[12];
   assign decoded_masks_0[ 26] = encoded_masks[ 0] ^ encoded_masks[ 6] ^ encoded_masks[10];
   assign decoded_masks_0[ 27] = encoded_masks[ 0] ^ encoded_masks[ 5] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 28] = encoded_masks[ 3] ^ encoded_masks[ 5] ^ encoded_masks[ 6];
   assign decoded_masks_0[ 29] = encoded_masks[ 2] ^ encoded_masks[10] ^ encoded_masks[12];
   assign decoded_masks_0[ 30] = encoded_masks[ 4] ^ encoded_masks[ 7] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 31] = encoded_masks[ 9] ^ encoded_masks[10] ^ encoded_masks[11];
   assign decoded_masks_0[ 32] = encoded_masks[ 2] ^ encoded_masks[ 8] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 33] = encoded_masks[ 3] ^ encoded_masks[ 7] ^ encoded_masks[11];
   assign decoded_masks_0[ 34] = encoded_masks[ 4] ^ encoded_masks[ 5] ^ encoded_masks[12];
   assign decoded_masks_0[ 35] = encoded_masks[ 2] ^ encoded_masks[ 5] ^ encoded_masks[ 6];
   assign decoded_masks_0[ 36] = encoded_masks[ 0] ^ encoded_masks[ 7] ^ encoded_masks[12];
   assign decoded_masks_0[ 37] = encoded_masks[ 3] ^ encoded_masks[ 4] ^ encoded_masks[11];
   assign decoded_masks_0[ 38] = encoded_masks[ 0] ^ encoded_masks[ 6] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 39] = encoded_masks[ 3] ^ encoded_masks[ 8] ^ encoded_masks[10];
   assign decoded_masks_0[ 40] = encoded_masks[ 6] ^ encoded_masks[ 7] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 41] = encoded_masks[ 0] ^ encoded_masks[ 4] ^ encoded_masks[11];
   assign decoded_masks_0[ 42] = encoded_masks[ 5] ^ encoded_masks[ 9] ^ encoded_masks[12];
   assign decoded_masks_0[ 43] = encoded_masks[ 2] ^ encoded_masks[ 4] ^ encoded_masks[ 6];
   assign decoded_masks_0[ 44] = encoded_masks[ 5] ^ encoded_masks[ 8] ^ encoded_masks[12];
   assign decoded_masks_0[ 45] = encoded_masks[ 3] ^ encoded_masks[ 9] ^ encoded_masks[10];
   assign decoded_masks_0[ 46] = encoded_masks[ 2] ^ encoded_masks[10] ^ encoded_masks[11];
   assign decoded_masks_0[ 47] = encoded_masks[ 5] ^ encoded_masks[ 7] ^ encoded_masks[10];
   assign decoded_masks_0[ 48] = encoded_masks[ 1] ^ encoded_masks[ 4] ^ encoded_masks[ 6];
   assign decoded_masks_0[ 49] = encoded_masks[ 2] ^ encoded_masks[ 3] ^ encoded_masks[12];
   assign decoded_masks_0[ 50] = encoded_masks[ 1] ^ encoded_masks[ 9] ^ encoded_masks[11];
   assign decoded_masks_0[ 51] = encoded_masks[ 2] ^ encoded_masks[ 3] ^ encoded_masks[ 4];
   assign decoded_masks_0[ 52] = encoded_masks[ 7] ^ encoded_masks[ 9] ^ encoded_masks[10];
   assign decoded_masks_0[ 53] = encoded_masks[ 1] ^ encoded_masks[ 5] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 54] = encoded_masks[ 7] ^ encoded_masks[ 9] ^ encoded_masks[11];
   assign decoded_masks_0[ 55] = encoded_masks[ 4] ^ encoded_masks[ 6] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 56] = encoded_masks[ 6] ^ encoded_masks[ 7] ^ encoded_masks[10];
   assign decoded_masks_0[ 57] = encoded_masks[ 3] ^ encoded_masks[ 8] ^ encoded_masks[12];
   assign decoded_masks_0[ 58] = encoded_masks[ 0] ^ encoded_masks[ 5] ^ encoded_masks[ 7];
   assign decoded_masks_0[ 59] = encoded_masks[ 2] ^ encoded_masks[ 9] ^ encoded_masks[12];
   assign decoded_masks_0[ 60] = encoded_masks[ 1] ^ encoded_masks[ 8] ^ encoded_masks[11];
   assign decoded_masks_0[ 61] = encoded_masks[ 3] ^ encoded_masks[ 5] ^ encoded_masks[11];
   assign decoded_masks_0[ 62] = encoded_masks[ 2] ^ encoded_masks[ 6] ^ encoded_masks[10];
   assign decoded_masks_0[ 63] = encoded_masks[ 4] ^ encoded_masks[ 7] ^ encoded_masks[12];
   assign decoded_masks_0[ 64] = encoded_masks[ 2] ^ encoded_masks[ 6] ^ encoded_masks[11];
   assign decoded_masks_0[ 65] = encoded_masks[ 0] ^ encoded_masks[10] ^ encoded_masks[12];
   assign decoded_masks_0[ 66] = encoded_masks[ 1] ^ encoded_masks[ 3] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 67] = encoded_masks[ 2] ^ encoded_masks[ 8] ^ encoded_masks[10];
   assign decoded_masks_0[ 68] = encoded_masks[ 4] ^ encoded_masks[ 5] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 69] = encoded_masks[ 4] ^ encoded_masks[ 9] ^ encoded_masks[11];
   assign decoded_masks_0[ 70] = encoded_masks[ 3] ^ encoded_masks[ 4] ^ encoded_masks[10];
   assign decoded_masks_0[ 71] = encoded_masks[ 6] ^ encoded_masks[11] ^ encoded_masks[12];
   assign decoded_masks_0[ 72] = encoded_masks[ 5] ^ encoded_masks[ 6] ^ encoded_masks[ 7];
   assign decoded_masks_0[ 73] = encoded_masks[ 0] ^ encoded_masks[ 7] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 74] = encoded_masks[ 2] ^ encoded_masks[ 7] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 75] = encoded_masks[ 1] ^ encoded_masks[ 5] ^ encoded_masks[11];
   assign decoded_masks_0[ 76] = encoded_masks[ 3] ^ encoded_masks[ 7] ^ encoded_masks[12];
   assign decoded_masks_0[ 77] = encoded_masks[ 2] ^ encoded_masks[ 4] ^ encoded_masks[10];
   assign decoded_masks_0[ 78] = encoded_masks[ 1] ^ encoded_masks[ 5] ^ encoded_masks[10];
   assign decoded_masks_0[ 79] = encoded_masks[ 3] ^ encoded_masks[ 6] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 80] = encoded_masks[ 4] ^ encoded_masks[11] ^ encoded_masks[12];
   assign decoded_masks_0[ 81] = encoded_masks[ 0] ^ encoded_masks[ 3] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 82] = encoded_masks[ 1] ^ encoded_masks[ 6] ^ encoded_masks[10];
   assign decoded_masks_0[ 83] = encoded_masks[ 3] ^ encoded_masks[ 8] ^ encoded_masks[11];
   assign decoded_masks_0[ 84] = encoded_masks[ 5] ^ encoded_masks[ 7] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 85] = encoded_masks[ 2] ^ encoded_masks[ 4] ^ encoded_masks[ 7];
   assign decoded_masks_0[ 86] = encoded_masks[ 1] ^ encoded_masks[ 6] ^ encoded_masks[12];
   assign decoded_masks_0[ 87] = encoded_masks[ 0] ^ encoded_masks[ 9] ^ encoded_masks[12];
   assign decoded_masks_0[ 88] = encoded_masks[ 2] ^ encoded_masks[ 4] ^ encoded_masks[ 8];
   assign decoded_masks_0[ 89] = encoded_masks[ 2] ^ encoded_masks[ 5] ^ encoded_masks[11];
   assign decoded_masks_0[ 90] = encoded_masks[ 4] ^ encoded_masks[ 8] ^ encoded_masks[ 9];
   assign decoded_masks_0[ 91] = encoded_masks[ 5] ^ encoded_masks[ 6] ^ encoded_masks[10];
   assign decoded_masks_0[ 92] = encoded_masks[ 1] ^ encoded_masks[ 4] ^ encoded_masks[12];
   assign decoded_masks_0[ 93] = encoded_masks[ 2] ^ encoded_masks[ 5] ^ encoded_masks[10];
   assign decoded_masks_0[ 94] = encoded_masks[ 1] ^ encoded_masks[ 3] ^ encoded_masks[ 6];
   assign decoded_masks_0[ 95] = encoded_masks[ 6] ^ encoded_masks[ 8] ^ encoded_masks[12];
   assign decoded_masks_0[ 96] = encoded_masks[ 8] ^ encoded_masks[ 9] ^ encoded_masks[11];
   assign decoded_masks_0[ 97] = encoded_masks[ 0] ^ encoded_masks[ 4] ^ encoded_masks[ 7];
   assign decoded_masks_0[ 98] = encoded_masks[ 2] ^ encoded_masks[ 3] ^ encoded_masks[ 7];
   assign decoded_masks_0[ 99] = encoded_masks[ 1] ^ encoded_masks[ 3] ^ encoded_masks[ 5];
   assign decoded_masks_0[100] = encoded_masks[ 9] ^ encoded_masks[10] ^ encoded_masks[12];
   assign decoded_masks_0[101] = encoded_masks[ 5] ^ encoded_masks[ 6] ^ encoded_masks[12];
   assign decoded_masks_0[102] = encoded_masks[ 0] ^ encoded_masks[10] ^ encoded_masks[11];
   assign decoded_masks_0[103] = encoded_masks[ 2] ^ encoded_masks[ 3] ^ encoded_masks[ 9];
   assign decoded_masks_0[104] = encoded_masks[ 3] ^ encoded_masks[ 7] ^ encoded_masks[ 8];
   assign decoded_masks_0[105] = encoded_masks[ 8] ^ encoded_masks[10] ^ encoded_masks[11];
   assign decoded_masks_0[106] = encoded_masks[ 0] ^ encoded_masks[ 3] ^ encoded_masks[ 5];
   assign decoded_masks_0[107] = encoded_masks[ 1] ^ encoded_masks[11] ^ encoded_masks[12];
   assign decoded_masks_0[108] = encoded_masks[ 1] ^ encoded_masks[ 7] ^ encoded_masks[ 9];
   assign decoded_masks_0[109] = encoded_masks[ 2] ^ encoded_masks[ 6] ^ encoded_masks[12];
   assign decoded_masks_0[110] = encoded_masks[ 0] ^ encoded_masks[ 3] ^ encoded_masks[ 4];
   assign decoded_masks_0[111] = encoded_masks[ 7] ^ encoded_masks[ 8] ^ encoded_masks[ 9];
   assign decoded_masks_0[112] = encoded_masks[ 0] ^ encoded_masks[ 5] ^ encoded_masks[11];
   assign decoded_masks_0[113] = encoded_masks[ 0] ^ encoded_masks[ 4] ^ encoded_masks[ 6];
   assign decoded_masks_0[114] = encoded_masks[ 1] ^ encoded_masks[ 2] ^ encoded_masks[ 6];
   assign decoded_masks_0[115] = encoded_masks[ 4] ^ encoded_masks[10] ^ encoded_masks[11];
   assign decoded_masks_0[116] = encoded_masks[ 1] ^ encoded_masks[ 4] ^ encoded_masks[ 7];
   assign decoded_masks_0[117] = encoded_masks[ 7] ^ encoded_masks[ 8] ^ encoded_masks[12];
   assign decoded_masks_0[118] = encoded_masks[ 5] ^ encoded_masks[ 9] ^ encoded_masks[10];
   assign decoded_masks_0[119] = encoded_masks[ 2] ^ encoded_masks[ 5] ^ encoded_masks[ 9];
   assign decoded_masks_0[120] = encoded_masks[ 0] ^ encoded_masks[ 2] ^ encoded_masks[ 6];
   assign decoded_masks_0[121] = encoded_masks[ 2] ^ encoded_masks[ 7] ^ encoded_masks[11];
   assign decoded_masks_0[122] = encoded_masks[ 6] ^ encoded_masks[ 8] ^ encoded_masks[11];

   assign decoded_masks_1[  0] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[15];
   assign decoded_masks_1[  1] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[16];
   assign decoded_masks_1[  2] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[17];
   assign decoded_masks_1[  3] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[18];
   assign decoded_masks_1[  4] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[19];
   assign decoded_masks_1[  5] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[20];
   assign decoded_masks_1[  6] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[21];
   assign decoded_masks_1[  7] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[22];
   assign decoded_masks_1[  8] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[23];
   assign decoded_masks_1[  9] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[24];
   assign decoded_masks_1[ 10] = encoded_masks[13] ^ encoded_masks[14] ^ encoded_masks[25];
   assign decoded_masks_1[ 11] = encoded_masks[13] ^ encoded_masks[15] ^ encoded_masks[16];
   assign decoded_masks_1[ 12] = encoded_masks[14] ^ encoded_masks[15] ^ encoded_masks[16];
   assign decoded_masks_1[ 13] = encoded_masks[16] ^ encoded_masks[19] ^ encoded_masks[20];
   assign decoded_masks_1[ 14] = encoded_masks[18] ^ encoded_masks[23] ^ encoded_masks[24];
   assign decoded_masks_1[ 15] = encoded_masks[14] ^ encoded_masks[17] ^ encoded_masks[22];
   assign decoded_masks_1[ 16] = encoded_masks[13] ^ encoded_masks[21] ^ encoded_masks[25];
   assign decoded_masks_1[ 17] = encoded_masks[17] ^ encoded_masks[19] ^ encoded_masks[24];
   assign decoded_masks_1[ 18] = encoded_masks[20] ^ encoded_masks[23] ^ encoded_masks[25];
   assign decoded_masks_1[ 19] = encoded_masks[18] ^ encoded_masks[21] ^ encoded_masks[22];
   assign decoded_masks_1[ 20] = encoded_masks[15] ^ encoded_masks[18] ^ encoded_masks[20];
   assign decoded_masks_1[ 21] = encoded_masks[19] ^ encoded_masks[22] ^ encoded_masks[25];
   assign decoded_masks_1[ 22] = encoded_masks[17] ^ encoded_masks[21] ^ encoded_masks[23];
   assign decoded_masks_1[ 23] = encoded_masks[15] ^ encoded_masks[21] ^ encoded_masks[24];
   assign decoded_masks_1[ 24] = encoded_masks[14] ^ encoded_masks[20] ^ encoded_masks[24];
   assign decoded_masks_1[ 25] = encoded_masks[16] ^ encoded_masks[17] ^ encoded_masks[25];
   assign decoded_masks_1[ 26] = encoded_masks[13] ^ encoded_masks[19] ^ encoded_masks[23];
   assign decoded_masks_1[ 27] = encoded_masks[13] ^ encoded_masks[18] ^ encoded_masks[22];
   assign decoded_masks_1[ 28] = encoded_masks[16] ^ encoded_masks[18] ^ encoded_masks[19];
   assign decoded_masks_1[ 29] = encoded_masks[15] ^ encoded_masks[23] ^ encoded_masks[25];
   assign decoded_masks_1[ 30] = encoded_masks[17] ^ encoded_masks[20] ^ encoded_masks[21];
   assign decoded_masks_1[ 31] = encoded_masks[22] ^ encoded_masks[23] ^ encoded_masks[24];
   assign decoded_masks_1[ 32] = encoded_masks[15] ^ encoded_masks[21] ^ encoded_masks[22];
   assign decoded_masks_1[ 33] = encoded_masks[16] ^ encoded_masks[20] ^ encoded_masks[24];
   assign decoded_masks_1[ 34] = encoded_masks[17] ^ encoded_masks[18] ^ encoded_masks[25];
   assign decoded_masks_1[ 35] = encoded_masks[15] ^ encoded_masks[18] ^ encoded_masks[19];
   assign decoded_masks_1[ 36] = encoded_masks[13] ^ encoded_masks[20] ^ encoded_masks[25];
   assign decoded_masks_1[ 37] = encoded_masks[16] ^ encoded_masks[17] ^ encoded_masks[24];
   assign decoded_masks_1[ 38] = encoded_masks[13] ^ encoded_masks[19] ^ encoded_masks[22];
   assign decoded_masks_1[ 39] = encoded_masks[16] ^ encoded_masks[21] ^ encoded_masks[23];
   assign decoded_masks_1[ 40] = encoded_masks[19] ^ encoded_masks[20] ^ encoded_masks[21];
   assign decoded_masks_1[ 41] = encoded_masks[13] ^ encoded_masks[17] ^ encoded_masks[24];
   assign decoded_masks_1[ 42] = encoded_masks[18] ^ encoded_masks[22] ^ encoded_masks[25];
   assign decoded_masks_1[ 43] = encoded_masks[15] ^ encoded_masks[17] ^ encoded_masks[19];
   assign decoded_masks_1[ 44] = encoded_masks[18] ^ encoded_masks[21] ^ encoded_masks[25];
   assign decoded_masks_1[ 45] = encoded_masks[16] ^ encoded_masks[22] ^ encoded_masks[23];
   assign decoded_masks_1[ 46] = encoded_masks[15] ^ encoded_masks[23] ^ encoded_masks[24];
   assign decoded_masks_1[ 47] = encoded_masks[18] ^ encoded_masks[20] ^ encoded_masks[23];
   assign decoded_masks_1[ 48] = encoded_masks[14] ^ encoded_masks[17] ^ encoded_masks[19];
   assign decoded_masks_1[ 49] = encoded_masks[15] ^ encoded_masks[16] ^ encoded_masks[25];
   assign decoded_masks_1[ 50] = encoded_masks[14] ^ encoded_masks[22] ^ encoded_masks[24];
   assign decoded_masks_1[ 51] = encoded_masks[15] ^ encoded_masks[16] ^ encoded_masks[17];
   assign decoded_masks_1[ 52] = encoded_masks[20] ^ encoded_masks[22] ^ encoded_masks[23];
   assign decoded_masks_1[ 53] = encoded_masks[14] ^ encoded_masks[18] ^ encoded_masks[21];
   assign decoded_masks_1[ 54] = encoded_masks[20] ^ encoded_masks[22] ^ encoded_masks[24];
   assign decoded_masks_1[ 55] = encoded_masks[17] ^ encoded_masks[19] ^ encoded_masks[21];
   assign decoded_masks_1[ 56] = encoded_masks[19] ^ encoded_masks[20] ^ encoded_masks[23];
   assign decoded_masks_1[ 57] = encoded_masks[16] ^ encoded_masks[21] ^ encoded_masks[25];
   assign decoded_masks_1[ 58] = encoded_masks[13] ^ encoded_masks[18] ^ encoded_masks[20];
   assign decoded_masks_1[ 59] = encoded_masks[15] ^ encoded_masks[22] ^ encoded_masks[25];
   assign decoded_masks_1[ 60] = encoded_masks[14] ^ encoded_masks[21] ^ encoded_masks[24];
   assign decoded_masks_1[ 61] = encoded_masks[16] ^ encoded_masks[18] ^ encoded_masks[24];
   assign decoded_masks_1[ 62] = encoded_masks[15] ^ encoded_masks[19] ^ encoded_masks[23];
   assign decoded_masks_1[ 63] = encoded_masks[17] ^ encoded_masks[20] ^ encoded_masks[25];
   assign decoded_masks_1[ 64] = encoded_masks[15] ^ encoded_masks[19] ^ encoded_masks[24];
   assign decoded_masks_1[ 65] = encoded_masks[13] ^ encoded_masks[23] ^ encoded_masks[25];
   assign decoded_masks_1[ 66] = encoded_masks[14] ^ encoded_masks[16] ^ encoded_masks[22];
   assign decoded_masks_1[ 67] = encoded_masks[15] ^ encoded_masks[21] ^ encoded_masks[23];
   assign decoded_masks_1[ 68] = encoded_masks[17] ^ encoded_masks[18] ^ encoded_masks[21];
   assign decoded_masks_1[ 69] = encoded_masks[17] ^ encoded_masks[22] ^ encoded_masks[24];
   assign decoded_masks_1[ 70] = encoded_masks[16] ^ encoded_masks[17] ^ encoded_masks[23];
   assign decoded_masks_1[ 71] = encoded_masks[19] ^ encoded_masks[24] ^ encoded_masks[25];
   assign decoded_masks_1[ 72] = encoded_masks[18] ^ encoded_masks[19] ^ encoded_masks[20];
   assign decoded_masks_1[ 73] = encoded_masks[13] ^ encoded_masks[20] ^ encoded_masks[21];
   assign decoded_masks_1[ 74] = encoded_masks[15] ^ encoded_masks[20] ^ encoded_masks[22];
   assign decoded_masks_1[ 75] = encoded_masks[14] ^ encoded_masks[18] ^ encoded_masks[24];
   assign decoded_masks_1[ 76] = encoded_masks[16] ^ encoded_masks[20] ^ encoded_masks[25];
   assign decoded_masks_1[ 77] = encoded_masks[15] ^ encoded_masks[17] ^ encoded_masks[23];
   assign decoded_masks_1[ 78] = encoded_masks[14] ^ encoded_masks[18] ^ encoded_masks[23];
   assign decoded_masks_1[ 79] = encoded_masks[16] ^ encoded_masks[19] ^ encoded_masks[22];
   assign decoded_masks_1[ 80] = encoded_masks[17] ^ encoded_masks[24] ^ encoded_masks[25];
   assign decoded_masks_1[ 81] = encoded_masks[13] ^ encoded_masks[16] ^ encoded_masks[21];
   assign decoded_masks_1[ 82] = encoded_masks[14] ^ encoded_masks[19] ^ encoded_masks[23];
   assign decoded_masks_1[ 83] = encoded_masks[16] ^ encoded_masks[21] ^ encoded_masks[24];
   assign decoded_masks_1[ 84] = encoded_masks[18] ^ encoded_masks[20] ^ encoded_masks[22];
   assign decoded_masks_1[ 85] = encoded_masks[15] ^ encoded_masks[17] ^ encoded_masks[20];
   assign decoded_masks_1[ 86] = encoded_masks[14] ^ encoded_masks[19] ^ encoded_masks[25];
   assign decoded_masks_1[ 87] = encoded_masks[13] ^ encoded_masks[22] ^ encoded_masks[25];
   assign decoded_masks_1[ 88] = encoded_masks[15] ^ encoded_masks[17] ^ encoded_masks[21];
   assign decoded_masks_1[ 89] = encoded_masks[15] ^ encoded_masks[18] ^ encoded_masks[24];
   assign decoded_masks_1[ 90] = encoded_masks[17] ^ encoded_masks[21] ^ encoded_masks[22];
   assign decoded_masks_1[ 91] = encoded_masks[18] ^ encoded_masks[19] ^ encoded_masks[23];
   assign decoded_masks_1[ 92] = encoded_masks[14] ^ encoded_masks[17] ^ encoded_masks[25];
   assign decoded_masks_1[ 93] = encoded_masks[15] ^ encoded_masks[18] ^ encoded_masks[23];
   assign decoded_masks_1[ 94] = encoded_masks[14] ^ encoded_masks[16] ^ encoded_masks[19];
   assign decoded_masks_1[ 95] = encoded_masks[19] ^ encoded_masks[21] ^ encoded_masks[25];
   assign decoded_masks_1[ 96] = encoded_masks[21] ^ encoded_masks[22] ^ encoded_masks[24];
   assign decoded_masks_1[ 97] = encoded_masks[13] ^ encoded_masks[17] ^ encoded_masks[20];
   assign decoded_masks_1[ 98] = encoded_masks[15] ^ encoded_masks[16] ^ encoded_masks[20];
   assign decoded_masks_1[ 99] = encoded_masks[14] ^ encoded_masks[16] ^ encoded_masks[18];
   assign decoded_masks_1[100] = encoded_masks[22] ^ encoded_masks[23] ^ encoded_masks[25];
   assign decoded_masks_1[101] = encoded_masks[18] ^ encoded_masks[19] ^ encoded_masks[25];
   assign decoded_masks_1[102] = encoded_masks[13] ^ encoded_masks[23] ^ encoded_masks[24];
   assign decoded_masks_1[103] = encoded_masks[15] ^ encoded_masks[16] ^ encoded_masks[22];
   assign decoded_masks_1[104] = encoded_masks[16] ^ encoded_masks[20] ^ encoded_masks[21];
   assign decoded_masks_1[105] = encoded_masks[21] ^ encoded_masks[23] ^ encoded_masks[24];
   assign decoded_masks_1[106] = encoded_masks[13] ^ encoded_masks[16] ^ encoded_masks[18];
   assign decoded_masks_1[107] = encoded_masks[14] ^ encoded_masks[24] ^ encoded_masks[25];
   assign decoded_masks_1[108] = encoded_masks[14] ^ encoded_masks[20] ^ encoded_masks[22];
   assign decoded_masks_1[109] = encoded_masks[15] ^ encoded_masks[19] ^ encoded_masks[25];
   assign decoded_masks_1[110] = encoded_masks[13] ^ encoded_masks[16] ^ encoded_masks[17];
   assign decoded_masks_1[111] = encoded_masks[20] ^ encoded_masks[21] ^ encoded_masks[22];
   assign decoded_masks_1[112] = encoded_masks[13] ^ encoded_masks[18] ^ encoded_masks[24];
   assign decoded_masks_1[113] = encoded_masks[13] ^ encoded_masks[17] ^ encoded_masks[19];
   assign decoded_masks_1[114] = encoded_masks[14] ^ encoded_masks[15] ^ encoded_masks[19];
   assign decoded_masks_1[115] = encoded_masks[17] ^ encoded_masks[23] ^ encoded_masks[24];
   assign decoded_masks_1[116] = encoded_masks[14] ^ encoded_masks[17] ^ encoded_masks[20];
   assign decoded_masks_1[117] = encoded_masks[20] ^ encoded_masks[21] ^ encoded_masks[25];
   assign decoded_masks_1[118] = encoded_masks[18] ^ encoded_masks[22] ^ encoded_masks[23];
   assign decoded_masks_1[119] = encoded_masks[15] ^ encoded_masks[18] ^ encoded_masks[22];
   assign decoded_masks_1[120] = encoded_masks[13] ^ encoded_masks[15] ^ encoded_masks[19];
   assign decoded_masks_1[121] = encoded_masks[15] ^ encoded_masks[20] ^ encoded_masks[24];
   assign decoded_masks_1[122] = encoded_masks[19] ^ encoded_masks[21] ^ encoded_masks[24];

endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_controller (
   input  wire         edt_clock,
   input  wire         edt_update,
   input  wire         edt_low_power_shift_en,
   input  wire [  1:0] edt_channels_in,
   input  wire [245:0] edt_decompressor_out,
   output wire [  1:0] edt_channels_out_from_controller,
   output wire [122:0] masks_for_compactor_0,
   output wire [122:0] masks_for_compactor_1,
   output wire [245:0] edt_scan_in
);
   reg    [ 13:0] masks_shift_reg_0;
   reg    [ 12:0] masks_shift_reg_1;
   reg    [ 13:0] masks_hold_reg_0;
   reg    [ 12:0] masks_hold_reg_1;
   wire           control_bit;
   wire   [  6:0] onehot_encoded_masks_0;
   wire   [  6:0] onehot_encoded_masks_1;
   wire   [ 25:0] xor_encoded_masks;
   wire   [122:0] onehot_decoded_masks_0;
   wire   [122:0] onehot_decoded_masks_1;
   wire   [122:0] xor_decoded_masks_0;
   wire   [122:0] xor_decoded_masks_1;
   wire           masks_shift_reg_sync_reset;
   wire   [  1:0] edt_channels_out_from_low_power_shift_control;

   processor_core_logic_test_tessent_edt_EXT_EDT_low_power_shift_controller low_power_shift_controller_i (
      .edt_clock(edt_clock),
      .edt_update(edt_update),
      .edt_low_power_shift_en(edt_low_power_shift_en),
      .edt_channels_in(edt_channels_in),
      .edt_decompressor_out(edt_decompressor_out),
      .edt_channels_out_from_low_power_shift_control(edt_channels_out_from_low_power_shift_control),
      .edt_scan_in(edt_scan_in));

   assign masks_shift_reg_sync_reset = edt_update;

   // synopsys sync_set_reset masks_shift_reg_sync_reset
   always @(posedge edt_clock)
   begin : shift_masks_regs
      if (masks_shift_reg_sync_reset == 1'b1) begin
         masks_shift_reg_0 <= 14'b00000000000000;
         masks_shift_reg_1 <= 13'b0000000000000;
      end
      else begin
         masks_shift_reg_0 <= {edt_channels_out_from_low_power_shift_control[0], masks_shift_reg_0[13:1]};
         masks_shift_reg_1 <= {edt_channels_out_from_low_power_shift_control[1], masks_shift_reg_1[12:1]};
      end
   end

   always @(posedge edt_clock)
   begin : update_masks_regs
      if (edt_update == 1'b1) begin
         masks_hold_reg_0 <= masks_shift_reg_0;
         masks_hold_reg_1 <= masks_shift_reg_1;
      end
   end

   assign edt_channels_out_from_controller[0] = masks_shift_reg_0[0];
   assign edt_channels_out_from_controller[1] = masks_shift_reg_1[0];

   assign control_bit = masks_hold_reg_0[13];

   assign xor_encoded_masks = {masks_hold_reg_1[0], masks_hold_reg_1[1], masks_hold_reg_1[2], 
                               masks_hold_reg_1[3], masks_hold_reg_1[4], masks_hold_reg_1[5], 
                               masks_hold_reg_1[6], masks_hold_reg_1[7], masks_hold_reg_1[8], 
                               masks_hold_reg_1[9], masks_hold_reg_1[10], masks_hold_reg_1[11], 
                               masks_hold_reg_1[12], masks_hold_reg_0[0], masks_hold_reg_0[1], 
                               masks_hold_reg_0[2], masks_hold_reg_0[3], masks_hold_reg_0[4], 
                               masks_hold_reg_0[5], masks_hold_reg_0[6], masks_hold_reg_0[7], 
                               masks_hold_reg_0[8], masks_hold_reg_0[9], masks_hold_reg_0[10], 
                               masks_hold_reg_0[11], masks_hold_reg_0[12]};

   assign onehot_encoded_masks_0 = {masks_hold_reg_0[12], masks_hold_reg_0[11], masks_hold_reg_0[10], 
                                    masks_hold_reg_0[9], masks_hold_reg_0[8], masks_hold_reg_0[7], 
                                    masks_hold_reg_0[6]};
   assign onehot_encoded_masks_1 = {masks_hold_reg_1[12], masks_hold_reg_1[11], masks_hold_reg_1[10], 
                                    masks_hold_reg_1[9], masks_hold_reg_1[8], masks_hold_reg_1[7], 
                                    masks_hold_reg_1[6]};

   processor_core_logic_test_tessent_edt_EXT_EDT_xor_decoder xor_decoder (
      .encoded_masks(xor_encoded_masks),
      .decoded_masks_0(xor_decoded_masks_0),
      .decoded_masks_1(xor_decoded_masks_1));

   processor_core_logic_test_tessent_edt_EXT_EDT_onehot_decoder_7_to_123 decoder1 (.encoded_masks(onehot_encoded_masks_0),
                                                                                   .decoded_masks(onehot_decoded_masks_0));
   processor_core_logic_test_tessent_edt_EXT_EDT_onehot_decoder_7_to_123 decoder2 (.encoded_masks(onehot_encoded_masks_1),
                                                                                   .decoded_masks(onehot_decoded_masks_1));

   assign masks_for_compactor_0 = control_bit ? onehot_decoded_masks_0 : xor_decoded_masks_0;
   assign masks_for_compactor_1 = control_bit ? onehot_decoded_masks_1 : xor_decoded_masks_1;
endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_spatial_compactor_123_w_output_lockup (
   input  wire         edt_clock,
   input  wire [122:0] multi_bit_input,
   output reg          single_bit_output
);
   reg    [ 61:0] level1;
   reg    [ 30:0] level2_pipelined;
   reg    [ 15:0] level3;
   reg    [  7:0] level4_pipelined;
   reg    [  3:0] level5;
   reg    [  1:0] level6_pipelined;

   always @(multi_bit_input)
   begin : compact123_level1
      level1[ 0] = multi_bit_input[  0] ^ multi_bit_input[  1];
      level1[ 1] = multi_bit_input[  2] ^ multi_bit_input[  3];
      level1[ 2] = multi_bit_input[  4] ^ multi_bit_input[  5];
      level1[ 3] = multi_bit_input[  6] ^ multi_bit_input[  7];
      level1[ 4] = multi_bit_input[  8] ^ multi_bit_input[  9];
      level1[ 5] = multi_bit_input[ 10] ^ multi_bit_input[ 11];
      level1[ 6] = multi_bit_input[ 12] ^ multi_bit_input[ 13];
      level1[ 7] = multi_bit_input[ 14] ^ multi_bit_input[ 15];
      level1[ 8] = multi_bit_input[ 16] ^ multi_bit_input[ 17];
      level1[ 9] = multi_bit_input[ 18] ^ multi_bit_input[ 19];
      level1[10] = multi_bit_input[ 20] ^ multi_bit_input[ 21];
      level1[11] = multi_bit_input[ 22] ^ multi_bit_input[ 23];
      level1[12] = multi_bit_input[ 24] ^ multi_bit_input[ 25];
      level1[13] = multi_bit_input[ 26] ^ multi_bit_input[ 27];
      level1[14] = multi_bit_input[ 28] ^ multi_bit_input[ 29];
      level1[15] = multi_bit_input[ 30] ^ multi_bit_input[ 31];
      level1[16] = multi_bit_input[ 32] ^ multi_bit_input[ 33];
      level1[17] = multi_bit_input[ 34] ^ multi_bit_input[ 35];
      level1[18] = multi_bit_input[ 36] ^ multi_bit_input[ 37];
      level1[19] = multi_bit_input[ 38] ^ multi_bit_input[ 39];
      level1[20] = multi_bit_input[ 40] ^ multi_bit_input[ 41];
      level1[21] = multi_bit_input[ 42] ^ multi_bit_input[ 43];
      level1[22] = multi_bit_input[ 44] ^ multi_bit_input[ 45];
      level1[23] = multi_bit_input[ 46] ^ multi_bit_input[ 47];
      level1[24] = multi_bit_input[ 48] ^ multi_bit_input[ 49];
      level1[25] = multi_bit_input[ 50] ^ multi_bit_input[ 51];
      level1[26] = multi_bit_input[ 52] ^ multi_bit_input[ 53];
      level1[27] = multi_bit_input[ 54] ^ multi_bit_input[ 55];
      level1[28] = multi_bit_input[ 56] ^ multi_bit_input[ 57];
      level1[29] = multi_bit_input[ 58] ^ multi_bit_input[ 59];
      level1[30] = multi_bit_input[ 60] ^ multi_bit_input[ 61];
      level1[31] = multi_bit_input[ 62] ^ multi_bit_input[ 63];
      level1[32] = multi_bit_input[ 64] ^ multi_bit_input[ 65];
      level1[33] = multi_bit_input[ 66] ^ multi_bit_input[ 67];
      level1[34] = multi_bit_input[ 68] ^ multi_bit_input[ 69];
      level1[35] = multi_bit_input[ 70] ^ multi_bit_input[ 71];
      level1[36] = multi_bit_input[ 72] ^ multi_bit_input[ 73];
      level1[37] = multi_bit_input[ 74] ^ multi_bit_input[ 75];
      level1[38] = multi_bit_input[ 76] ^ multi_bit_input[ 77];
      level1[39] = multi_bit_input[ 78] ^ multi_bit_input[ 79];
      level1[40] = multi_bit_input[ 80] ^ multi_bit_input[ 81];
      level1[41] = multi_bit_input[ 82] ^ multi_bit_input[ 83];
      level1[42] = multi_bit_input[ 84] ^ multi_bit_input[ 85];
      level1[43] = multi_bit_input[ 86] ^ multi_bit_input[ 87];
      level1[44] = multi_bit_input[ 88] ^ multi_bit_input[ 89];
      level1[45] = multi_bit_input[ 90] ^ multi_bit_input[ 91];
      level1[46] = multi_bit_input[ 92] ^ multi_bit_input[ 93];
      level1[47] = multi_bit_input[ 94] ^ multi_bit_input[ 95];
      level1[48] = multi_bit_input[ 96] ^ multi_bit_input[ 97];
      level1[49] = multi_bit_input[ 98] ^ multi_bit_input[ 99];
      level1[50] = multi_bit_input[100] ^ multi_bit_input[101];
      level1[51] = multi_bit_input[102] ^ multi_bit_input[103];
      level1[52] = multi_bit_input[104] ^ multi_bit_input[105];
      level1[53] = multi_bit_input[106] ^ multi_bit_input[107];
      level1[54] = multi_bit_input[108] ^ multi_bit_input[109];
      level1[55] = multi_bit_input[110] ^ multi_bit_input[111];
      level1[56] = multi_bit_input[112] ^ multi_bit_input[113];
      level1[57] = multi_bit_input[114] ^ multi_bit_input[115];
      level1[58] = multi_bit_input[116] ^ multi_bit_input[117];
      level1[59] = multi_bit_input[118] ^ multi_bit_input[119];
      level1[60] = multi_bit_input[120] ^ multi_bit_input[121];
      level1[61] = multi_bit_input[122];
   end

   always @(posedge edt_clock)
   begin : compact123_level2_pipelined
      level2_pipelined[ 0] <= level1[ 0] ^ level1[ 1];
      level2_pipelined[ 1] <= level1[ 2] ^ level1[ 3];
      level2_pipelined[ 2] <= level1[ 4] ^ level1[ 5];
      level2_pipelined[ 3] <= level1[ 6] ^ level1[ 7];
      level2_pipelined[ 4] <= level1[ 8] ^ level1[ 9];
      level2_pipelined[ 5] <= level1[10] ^ level1[11];
      level2_pipelined[ 6] <= level1[12] ^ level1[13];
      level2_pipelined[ 7] <= level1[14] ^ level1[15];
      level2_pipelined[ 8] <= level1[16] ^ level1[17];
      level2_pipelined[ 9] <= level1[18] ^ level1[19];
      level2_pipelined[10] <= level1[20] ^ level1[21];
      level2_pipelined[11] <= level1[22] ^ level1[23];
      level2_pipelined[12] <= level1[24] ^ level1[25];
      level2_pipelined[13] <= level1[26] ^ level1[27];
      level2_pipelined[14] <= level1[28] ^ level1[29];
      level2_pipelined[15] <= level1[30] ^ level1[31];
      level2_pipelined[16] <= level1[32] ^ level1[33];
      level2_pipelined[17] <= level1[34] ^ level1[35];
      level2_pipelined[18] <= level1[36] ^ level1[37];
      level2_pipelined[19] <= level1[38] ^ level1[39];
      level2_pipelined[20] <= level1[40] ^ level1[41];
      level2_pipelined[21] <= level1[42] ^ level1[43];
      level2_pipelined[22] <= level1[44] ^ level1[45];
      level2_pipelined[23] <= level1[46] ^ level1[47];
      level2_pipelined[24] <= level1[48] ^ level1[49];
      level2_pipelined[25] <= level1[50] ^ level1[51];
      level2_pipelined[26] <= level1[52] ^ level1[53];
      level2_pipelined[27] <= level1[54] ^ level1[55];
      level2_pipelined[28] <= level1[56] ^ level1[57];
      level2_pipelined[29] <= level1[58] ^ level1[59];
      level2_pipelined[30] <= level1[60] ^ level1[61];
   end

   always @(level2_pipelined)
   begin : compact123_level3
      level3[ 0] = level2_pipelined[ 0] ^ level2_pipelined[ 1];
      level3[ 1] = level2_pipelined[ 2] ^ level2_pipelined[ 3];
      level3[ 2] = level2_pipelined[ 4] ^ level2_pipelined[ 5];
      level3[ 3] = level2_pipelined[ 6] ^ level2_pipelined[ 7];
      level3[ 4] = level2_pipelined[ 8] ^ level2_pipelined[ 9];
      level3[ 5] = level2_pipelined[10] ^ level2_pipelined[11];
      level3[ 6] = level2_pipelined[12] ^ level2_pipelined[13];
      level3[ 7] = level2_pipelined[14] ^ level2_pipelined[15];
      level3[ 8] = level2_pipelined[16] ^ level2_pipelined[17];
      level3[ 9] = level2_pipelined[18] ^ level2_pipelined[19];
      level3[10] = level2_pipelined[20] ^ level2_pipelined[21];
      level3[11] = level2_pipelined[22] ^ level2_pipelined[23];
      level3[12] = level2_pipelined[24] ^ level2_pipelined[25];
      level3[13] = level2_pipelined[26] ^ level2_pipelined[27];
      level3[14] = level2_pipelined[28] ^ level2_pipelined[29];
      level3[15] = level2_pipelined[30];
   end

   always @(posedge edt_clock)
   begin : compact123_level4_pipelined
      level4_pipelined[0] <= level3[ 0] ^ level3[ 1];
      level4_pipelined[1] <= level3[ 2] ^ level3[ 3];
      level4_pipelined[2] <= level3[ 4] ^ level3[ 5];
      level4_pipelined[3] <= level3[ 6] ^ level3[ 7];
      level4_pipelined[4] <= level3[ 8] ^ level3[ 9];
      level4_pipelined[5] <= level3[10] ^ level3[11];
      level4_pipelined[6] <= level3[12] ^ level3[13];
      level4_pipelined[7] <= level3[14] ^ level3[15];
   end

   always @(level4_pipelined)
   begin : compact123_level5
      level5[0] = level4_pipelined[0] ^ level4_pipelined[1];
      level5[1] = level4_pipelined[2] ^ level4_pipelined[3];
      level5[2] = level4_pipelined[4] ^ level4_pipelined[5];
      level5[3] = level4_pipelined[6] ^ level4_pipelined[7];
   end

   always @(posedge edt_clock)
   begin : compact123_level6_pipelined
      level6_pipelined[0] <= level5[0] ^ level5[1];
      level6_pipelined[1] <= level5[2] ^ level5[3];
   end

   always @(negedge edt_clock)
   begin : compact123_level7_lockup
      single_bit_output <= level6_pipelined[0] ^ level6_pipelined[1];
   end

endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_compactor (
   input  wire         edt_clock,
   input  wire [245:0] edt_scan_out,
   input  wire [122:0] masks_for_compactor_0,
   input  wire [122:0] masks_for_compactor_1,
   output wire [  1:0] edt_channels_out
);
   wire   [122:0] masked_scan_outputs_0;
   wire   [122:0] masked_scan_outputs_1;

   assign masked_scan_outputs_0 = edt_scan_out[122:  0] & masks_for_compactor_0;
   assign masked_scan_outputs_1 = edt_scan_out[245:123] & masks_for_compactor_1;

   processor_core_logic_test_tessent_edt_EXT_EDT_spatial_compactor_123_w_output_lockup compactor1 (
      .edt_clock(edt_clock),
      .multi_bit_input(masked_scan_outputs_0),
      .single_bit_output(edt_channels_out[0]));
   processor_core_logic_test_tessent_edt_EXT_EDT_spatial_compactor_123_w_output_lockup compactor2 (
      .edt_clock(edt_clock),
      .multi_bit_input(masked_scan_outputs_1),
      .single_bit_output(edt_channels_out[1]));
endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT_bypass_logic (
   input  wire         edt_bypass,
   input  wire [  1:0] edt_channels_in,
   output wire [  1:0] edt_channels_out,
   output wire [245:0] edt_scan_in,
   input  wire [245:0] edt_scan_out,
   input  wire [245:0] edt_bypass_in,
   input  wire [  1:0] edt_bypass_out
);

   mux21 tessent_persistent_cell_edt_scan_in_mux_0 (
      .A0(edt_bypass_in[0]),
      .A1(edt_channels_in[0]),
      .S0(edt_bypass),
      .Y(edt_scan_in[0]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_1 (
      .A0(edt_bypass_in[1]),
      .A1(edt_scan_out[0]),
      .S0(edt_bypass),
      .Y(edt_scan_in[1]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_2 (
      .A0(edt_bypass_in[2]),
      .A1(edt_scan_out[1]),
      .S0(edt_bypass),
      .Y(edt_scan_in[2]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_3 (
      .A0(edt_bypass_in[3]),
      .A1(edt_scan_out[2]),
      .S0(edt_bypass),
      .Y(edt_scan_in[3]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_4 (
      .A0(edt_bypass_in[4]),
      .A1(edt_scan_out[3]),
      .S0(edt_bypass),
      .Y(edt_scan_in[4]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_5 (
      .A0(edt_bypass_in[5]),
      .A1(edt_scan_out[4]),
      .S0(edt_bypass),
      .Y(edt_scan_in[5]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_6 (
      .A0(edt_bypass_in[6]),
      .A1(edt_scan_out[5]),
      .S0(edt_bypass),
      .Y(edt_scan_in[6]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_7 (
      .A0(edt_bypass_in[7]),
      .A1(edt_scan_out[6]),
      .S0(edt_bypass),
      .Y(edt_scan_in[7]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_8 (
      .A0(edt_bypass_in[8]),
      .A1(edt_scan_out[7]),
      .S0(edt_bypass),
      .Y(edt_scan_in[8]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_9 (
      .A0(edt_bypass_in[9]),
      .A1(edt_scan_out[8]),
      .S0(edt_bypass),
      .Y(edt_scan_in[9]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_10 (
      .A0(edt_bypass_in[10]),
      .A1(edt_scan_out[9]),
      .S0(edt_bypass),
      .Y(edt_scan_in[10]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_11 (
      .A0(edt_bypass_in[11]),
      .A1(edt_scan_out[10]),
      .S0(edt_bypass),
      .Y(edt_scan_in[11]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_12 (
      .A0(edt_bypass_in[12]),
      .A1(edt_scan_out[11]),
      .S0(edt_bypass),
      .Y(edt_scan_in[12]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_13 (
      .A0(edt_bypass_in[13]),
      .A1(edt_scan_out[12]),
      .S0(edt_bypass),
      .Y(edt_scan_in[13]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_14 (
      .A0(edt_bypass_in[14]),
      .A1(edt_scan_out[13]),
      .S0(edt_bypass),
      .Y(edt_scan_in[14]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_15 (
      .A0(edt_bypass_in[15]),
      .A1(edt_scan_out[14]),
      .S0(edt_bypass),
      .Y(edt_scan_in[15]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_16 (
      .A0(edt_bypass_in[16]),
      .A1(edt_scan_out[15]),
      .S0(edt_bypass),
      .Y(edt_scan_in[16]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_17 (
      .A0(edt_bypass_in[17]),
      .A1(edt_scan_out[16]),
      .S0(edt_bypass),
      .Y(edt_scan_in[17]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_18 (
      .A0(edt_bypass_in[18]),
      .A1(edt_scan_out[17]),
      .S0(edt_bypass),
      .Y(edt_scan_in[18]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_19 (
      .A0(edt_bypass_in[19]),
      .A1(edt_scan_out[18]),
      .S0(edt_bypass),
      .Y(edt_scan_in[19]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_20 (
      .A0(edt_bypass_in[20]),
      .A1(edt_scan_out[19]),
      .S0(edt_bypass),
      .Y(edt_scan_in[20]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_21 (
      .A0(edt_bypass_in[21]),
      .A1(edt_scan_out[20]),
      .S0(edt_bypass),
      .Y(edt_scan_in[21]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_22 (
      .A0(edt_bypass_in[22]),
      .A1(edt_scan_out[21]),
      .S0(edt_bypass),
      .Y(edt_scan_in[22]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_23 (
      .A0(edt_bypass_in[23]),
      .A1(edt_scan_out[22]),
      .S0(edt_bypass),
      .Y(edt_scan_in[23]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_24 (
      .A0(edt_bypass_in[24]),
      .A1(edt_scan_out[23]),
      .S0(edt_bypass),
      .Y(edt_scan_in[24]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_25 (
      .A0(edt_bypass_in[25]),
      .A1(edt_scan_out[24]),
      .S0(edt_bypass),
      .Y(edt_scan_in[25]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_26 (
      .A0(edt_bypass_in[26]),
      .A1(edt_scan_out[25]),
      .S0(edt_bypass),
      .Y(edt_scan_in[26]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_27 (
      .A0(edt_bypass_in[27]),
      .A1(edt_scan_out[26]),
      .S0(edt_bypass),
      .Y(edt_scan_in[27]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_28 (
      .A0(edt_bypass_in[28]),
      .A1(edt_scan_out[27]),
      .S0(edt_bypass),
      .Y(edt_scan_in[28]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_29 (
      .A0(edt_bypass_in[29]),
      .A1(edt_scan_out[28]),
      .S0(edt_bypass),
      .Y(edt_scan_in[29]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_30 (
      .A0(edt_bypass_in[30]),
      .A1(edt_scan_out[29]),
      .S0(edt_bypass),
      .Y(edt_scan_in[30]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_31 (
      .A0(edt_bypass_in[31]),
      .A1(edt_scan_out[30]),
      .S0(edt_bypass),
      .Y(edt_scan_in[31]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_32 (
      .A0(edt_bypass_in[32]),
      .A1(edt_scan_out[31]),
      .S0(edt_bypass),
      .Y(edt_scan_in[32]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_33 (
      .A0(edt_bypass_in[33]),
      .A1(edt_scan_out[32]),
      .S0(edt_bypass),
      .Y(edt_scan_in[33]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_34 (
      .A0(edt_bypass_in[34]),
      .A1(edt_scan_out[33]),
      .S0(edt_bypass),
      .Y(edt_scan_in[34]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_35 (
      .A0(edt_bypass_in[35]),
      .A1(edt_scan_out[34]),
      .S0(edt_bypass),
      .Y(edt_scan_in[35]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_36 (
      .A0(edt_bypass_in[36]),
      .A1(edt_scan_out[35]),
      .S0(edt_bypass),
      .Y(edt_scan_in[36]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_37 (
      .A0(edt_bypass_in[37]),
      .A1(edt_scan_out[36]),
      .S0(edt_bypass),
      .Y(edt_scan_in[37]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_38 (
      .A0(edt_bypass_in[38]),
      .A1(edt_scan_out[37]),
      .S0(edt_bypass),
      .Y(edt_scan_in[38]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_39 (
      .A0(edt_bypass_in[39]),
      .A1(edt_scan_out[38]),
      .S0(edt_bypass),
      .Y(edt_scan_in[39]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_40 (
      .A0(edt_bypass_in[40]),
      .A1(edt_scan_out[39]),
      .S0(edt_bypass),
      .Y(edt_scan_in[40]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_41 (
      .A0(edt_bypass_in[41]),
      .A1(edt_scan_out[40]),
      .S0(edt_bypass),
      .Y(edt_scan_in[41]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_42 (
      .A0(edt_bypass_in[42]),
      .A1(edt_scan_out[41]),
      .S0(edt_bypass),
      .Y(edt_scan_in[42]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_43 (
      .A0(edt_bypass_in[43]),
      .A1(edt_scan_out[42]),
      .S0(edt_bypass),
      .Y(edt_scan_in[43]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_44 (
      .A0(edt_bypass_in[44]),
      .A1(edt_scan_out[43]),
      .S0(edt_bypass),
      .Y(edt_scan_in[44]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_45 (
      .A0(edt_bypass_in[45]),
      .A1(edt_scan_out[44]),
      .S0(edt_bypass),
      .Y(edt_scan_in[45]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_46 (
      .A0(edt_bypass_in[46]),
      .A1(edt_scan_out[45]),
      .S0(edt_bypass),
      .Y(edt_scan_in[46]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_47 (
      .A0(edt_bypass_in[47]),
      .A1(edt_scan_out[46]),
      .S0(edt_bypass),
      .Y(edt_scan_in[47]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_48 (
      .A0(edt_bypass_in[48]),
      .A1(edt_scan_out[47]),
      .S0(edt_bypass),
      .Y(edt_scan_in[48]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_49 (
      .A0(edt_bypass_in[49]),
      .A1(edt_scan_out[48]),
      .S0(edt_bypass),
      .Y(edt_scan_in[49]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_50 (
      .A0(edt_bypass_in[50]),
      .A1(edt_scan_out[49]),
      .S0(edt_bypass),
      .Y(edt_scan_in[50]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_51 (
      .A0(edt_bypass_in[51]),
      .A1(edt_scan_out[50]),
      .S0(edt_bypass),
      .Y(edt_scan_in[51]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_52 (
      .A0(edt_bypass_in[52]),
      .A1(edt_scan_out[51]),
      .S0(edt_bypass),
      .Y(edt_scan_in[52]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_53 (
      .A0(edt_bypass_in[53]),
      .A1(edt_scan_out[52]),
      .S0(edt_bypass),
      .Y(edt_scan_in[53]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_54 (
      .A0(edt_bypass_in[54]),
      .A1(edt_scan_out[53]),
      .S0(edt_bypass),
      .Y(edt_scan_in[54]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_55 (
      .A0(edt_bypass_in[55]),
      .A1(edt_scan_out[54]),
      .S0(edt_bypass),
      .Y(edt_scan_in[55]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_56 (
      .A0(edt_bypass_in[56]),
      .A1(edt_scan_out[55]),
      .S0(edt_bypass),
      .Y(edt_scan_in[56]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_57 (
      .A0(edt_bypass_in[57]),
      .A1(edt_scan_out[56]),
      .S0(edt_bypass),
      .Y(edt_scan_in[57]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_58 (
      .A0(edt_bypass_in[58]),
      .A1(edt_scan_out[57]),
      .S0(edt_bypass),
      .Y(edt_scan_in[58]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_59 (
      .A0(edt_bypass_in[59]),
      .A1(edt_scan_out[58]),
      .S0(edt_bypass),
      .Y(edt_scan_in[59]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_60 (
      .A0(edt_bypass_in[60]),
      .A1(edt_scan_out[59]),
      .S0(edt_bypass),
      .Y(edt_scan_in[60]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_61 (
      .A0(edt_bypass_in[61]),
      .A1(edt_scan_out[60]),
      .S0(edt_bypass),
      .Y(edt_scan_in[61]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_62 (
      .A0(edt_bypass_in[62]),
      .A1(edt_scan_out[61]),
      .S0(edt_bypass),
      .Y(edt_scan_in[62]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_63 (
      .A0(edt_bypass_in[63]),
      .A1(edt_scan_out[62]),
      .S0(edt_bypass),
      .Y(edt_scan_in[63]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_64 (
      .A0(edt_bypass_in[64]),
      .A1(edt_scan_out[63]),
      .S0(edt_bypass),
      .Y(edt_scan_in[64]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_65 (
      .A0(edt_bypass_in[65]),
      .A1(edt_scan_out[64]),
      .S0(edt_bypass),
      .Y(edt_scan_in[65]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_66 (
      .A0(edt_bypass_in[66]),
      .A1(edt_scan_out[65]),
      .S0(edt_bypass),
      .Y(edt_scan_in[66]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_67 (
      .A0(edt_bypass_in[67]),
      .A1(edt_scan_out[66]),
      .S0(edt_bypass),
      .Y(edt_scan_in[67]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_68 (
      .A0(edt_bypass_in[68]),
      .A1(edt_scan_out[67]),
      .S0(edt_bypass),
      .Y(edt_scan_in[68]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_69 (
      .A0(edt_bypass_in[69]),
      .A1(edt_scan_out[68]),
      .S0(edt_bypass),
      .Y(edt_scan_in[69]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_70 (
      .A0(edt_bypass_in[70]),
      .A1(edt_scan_out[69]),
      .S0(edt_bypass),
      .Y(edt_scan_in[70]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_71 (
      .A0(edt_bypass_in[71]),
      .A1(edt_scan_out[70]),
      .S0(edt_bypass),
      .Y(edt_scan_in[71]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_72 (
      .A0(edt_bypass_in[72]),
      .A1(edt_scan_out[71]),
      .S0(edt_bypass),
      .Y(edt_scan_in[72]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_73 (
      .A0(edt_bypass_in[73]),
      .A1(edt_scan_out[72]),
      .S0(edt_bypass),
      .Y(edt_scan_in[73]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_74 (
      .A0(edt_bypass_in[74]),
      .A1(edt_scan_out[73]),
      .S0(edt_bypass),
      .Y(edt_scan_in[74]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_75 (
      .A0(edt_bypass_in[75]),
      .A1(edt_scan_out[74]),
      .S0(edt_bypass),
      .Y(edt_scan_in[75]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_76 (
      .A0(edt_bypass_in[76]),
      .A1(edt_scan_out[75]),
      .S0(edt_bypass),
      .Y(edt_scan_in[76]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_77 (
      .A0(edt_bypass_in[77]),
      .A1(edt_scan_out[76]),
      .S0(edt_bypass),
      .Y(edt_scan_in[77]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_78 (
      .A0(edt_bypass_in[78]),
      .A1(edt_scan_out[77]),
      .S0(edt_bypass),
      .Y(edt_scan_in[78]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_79 (
      .A0(edt_bypass_in[79]),
      .A1(edt_scan_out[78]),
      .S0(edt_bypass),
      .Y(edt_scan_in[79]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_80 (
      .A0(edt_bypass_in[80]),
      .A1(edt_scan_out[79]),
      .S0(edt_bypass),
      .Y(edt_scan_in[80]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_81 (
      .A0(edt_bypass_in[81]),
      .A1(edt_scan_out[80]),
      .S0(edt_bypass),
      .Y(edt_scan_in[81]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_82 (
      .A0(edt_bypass_in[82]),
      .A1(edt_scan_out[81]),
      .S0(edt_bypass),
      .Y(edt_scan_in[82]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_83 (
      .A0(edt_bypass_in[83]),
      .A1(edt_scan_out[82]),
      .S0(edt_bypass),
      .Y(edt_scan_in[83]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_84 (
      .A0(edt_bypass_in[84]),
      .A1(edt_scan_out[83]),
      .S0(edt_bypass),
      .Y(edt_scan_in[84]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_85 (
      .A0(edt_bypass_in[85]),
      .A1(edt_scan_out[84]),
      .S0(edt_bypass),
      .Y(edt_scan_in[85]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_86 (
      .A0(edt_bypass_in[86]),
      .A1(edt_scan_out[85]),
      .S0(edt_bypass),
      .Y(edt_scan_in[86]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_87 (
      .A0(edt_bypass_in[87]),
      .A1(edt_scan_out[86]),
      .S0(edt_bypass),
      .Y(edt_scan_in[87]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_88 (
      .A0(edt_bypass_in[88]),
      .A1(edt_scan_out[87]),
      .S0(edt_bypass),
      .Y(edt_scan_in[88]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_89 (
      .A0(edt_bypass_in[89]),
      .A1(edt_scan_out[88]),
      .S0(edt_bypass),
      .Y(edt_scan_in[89]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_90 (
      .A0(edt_bypass_in[90]),
      .A1(edt_scan_out[89]),
      .S0(edt_bypass),
      .Y(edt_scan_in[90]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_91 (
      .A0(edt_bypass_in[91]),
      .A1(edt_scan_out[90]),
      .S0(edt_bypass),
      .Y(edt_scan_in[91]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_92 (
      .A0(edt_bypass_in[92]),
      .A1(edt_scan_out[91]),
      .S0(edt_bypass),
      .Y(edt_scan_in[92]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_93 (
      .A0(edt_bypass_in[93]),
      .A1(edt_scan_out[92]),
      .S0(edt_bypass),
      .Y(edt_scan_in[93]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_94 (
      .A0(edt_bypass_in[94]),
      .A1(edt_scan_out[93]),
      .S0(edt_bypass),
      .Y(edt_scan_in[94]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_95 (
      .A0(edt_bypass_in[95]),
      .A1(edt_scan_out[94]),
      .S0(edt_bypass),
      .Y(edt_scan_in[95]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_96 (
      .A0(edt_bypass_in[96]),
      .A1(edt_scan_out[95]),
      .S0(edt_bypass),
      .Y(edt_scan_in[96]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_97 (
      .A0(edt_bypass_in[97]),
      .A1(edt_scan_out[96]),
      .S0(edt_bypass),
      .Y(edt_scan_in[97]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_98 (
      .A0(edt_bypass_in[98]),
      .A1(edt_scan_out[97]),
      .S0(edt_bypass),
      .Y(edt_scan_in[98]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_99 (
      .A0(edt_bypass_in[99]),
      .A1(edt_scan_out[98]),
      .S0(edt_bypass),
      .Y(edt_scan_in[99]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_100 (
      .A0(edt_bypass_in[100]),
      .A1(edt_scan_out[99]),
      .S0(edt_bypass),
      .Y(edt_scan_in[100]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_101 (
      .A0(edt_bypass_in[101]),
      .A1(edt_scan_out[100]),
      .S0(edt_bypass),
      .Y(edt_scan_in[101]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_102 (
      .A0(edt_bypass_in[102]),
      .A1(edt_scan_out[101]),
      .S0(edt_bypass),
      .Y(edt_scan_in[102]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_103 (
      .A0(edt_bypass_in[103]),
      .A1(edt_scan_out[102]),
      .S0(edt_bypass),
      .Y(edt_scan_in[103]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_104 (
      .A0(edt_bypass_in[104]),
      .A1(edt_scan_out[103]),
      .S0(edt_bypass),
      .Y(edt_scan_in[104]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_105 (
      .A0(edt_bypass_in[105]),
      .A1(edt_scan_out[104]),
      .S0(edt_bypass),
      .Y(edt_scan_in[105]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_106 (
      .A0(edt_bypass_in[106]),
      .A1(edt_scan_out[105]),
      .S0(edt_bypass),
      .Y(edt_scan_in[106]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_107 (
      .A0(edt_bypass_in[107]),
      .A1(edt_scan_out[106]),
      .S0(edt_bypass),
      .Y(edt_scan_in[107]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_108 (
      .A0(edt_bypass_in[108]),
      .A1(edt_scan_out[107]),
      .S0(edt_bypass),
      .Y(edt_scan_in[108]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_109 (
      .A0(edt_bypass_in[109]),
      .A1(edt_scan_out[108]),
      .S0(edt_bypass),
      .Y(edt_scan_in[109]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_110 (
      .A0(edt_bypass_in[110]),
      .A1(edt_scan_out[109]),
      .S0(edt_bypass),
      .Y(edt_scan_in[110]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_111 (
      .A0(edt_bypass_in[111]),
      .A1(edt_scan_out[110]),
      .S0(edt_bypass),
      .Y(edt_scan_in[111]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_112 (
      .A0(edt_bypass_in[112]),
      .A1(edt_scan_out[111]),
      .S0(edt_bypass),
      .Y(edt_scan_in[112]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_113 (
      .A0(edt_bypass_in[113]),
      .A1(edt_scan_out[112]),
      .S0(edt_bypass),
      .Y(edt_scan_in[113]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_114 (
      .A0(edt_bypass_in[114]),
      .A1(edt_scan_out[113]),
      .S0(edt_bypass),
      .Y(edt_scan_in[114]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_115 (
      .A0(edt_bypass_in[115]),
      .A1(edt_scan_out[114]),
      .S0(edt_bypass),
      .Y(edt_scan_in[115]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_116 (
      .A0(edt_bypass_in[116]),
      .A1(edt_scan_out[115]),
      .S0(edt_bypass),
      .Y(edt_scan_in[116]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_117 (
      .A0(edt_bypass_in[117]),
      .A1(edt_scan_out[116]),
      .S0(edt_bypass),
      .Y(edt_scan_in[117]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_118 (
      .A0(edt_bypass_in[118]),
      .A1(edt_scan_out[117]),
      .S0(edt_bypass),
      .Y(edt_scan_in[118]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_119 (
      .A0(edt_bypass_in[119]),
      .A1(edt_scan_out[118]),
      .S0(edt_bypass),
      .Y(edt_scan_in[119]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_120 (
      .A0(edt_bypass_in[120]),
      .A1(edt_scan_out[119]),
      .S0(edt_bypass),
      .Y(edt_scan_in[120]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_121 (
      .A0(edt_bypass_in[121]),
      .A1(edt_scan_out[120]),
      .S0(edt_bypass),
      .Y(edt_scan_in[121]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_122 (
      .A0(edt_bypass_in[122]),
      .A1(edt_scan_out[121]),
      .S0(edt_bypass),
      .Y(edt_scan_in[122]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_123 (
      .A0(edt_bypass_in[123]),
      .A1(edt_channels_in[1]),
      .S0(edt_bypass),
      .Y(edt_scan_in[123]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_124 (
      .A0(edt_bypass_in[124]),
      .A1(edt_scan_out[123]),
      .S0(edt_bypass),
      .Y(edt_scan_in[124]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_125 (
      .A0(edt_bypass_in[125]),
      .A1(edt_scan_out[124]),
      .S0(edt_bypass),
      .Y(edt_scan_in[125]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_126 (
      .A0(edt_bypass_in[126]),
      .A1(edt_scan_out[125]),
      .S0(edt_bypass),
      .Y(edt_scan_in[126]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_127 (
      .A0(edt_bypass_in[127]),
      .A1(edt_scan_out[126]),
      .S0(edt_bypass),
      .Y(edt_scan_in[127]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_128 (
      .A0(edt_bypass_in[128]),
      .A1(edt_scan_out[127]),
      .S0(edt_bypass),
      .Y(edt_scan_in[128]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_129 (
      .A0(edt_bypass_in[129]),
      .A1(edt_scan_out[128]),
      .S0(edt_bypass),
      .Y(edt_scan_in[129]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_130 (
      .A0(edt_bypass_in[130]),
      .A1(edt_scan_out[129]),
      .S0(edt_bypass),
      .Y(edt_scan_in[130]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_131 (
      .A0(edt_bypass_in[131]),
      .A1(edt_scan_out[130]),
      .S0(edt_bypass),
      .Y(edt_scan_in[131]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_132 (
      .A0(edt_bypass_in[132]),
      .A1(edt_scan_out[131]),
      .S0(edt_bypass),
      .Y(edt_scan_in[132]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_133 (
      .A0(edt_bypass_in[133]),
      .A1(edt_scan_out[132]),
      .S0(edt_bypass),
      .Y(edt_scan_in[133]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_134 (
      .A0(edt_bypass_in[134]),
      .A1(edt_scan_out[133]),
      .S0(edt_bypass),
      .Y(edt_scan_in[134]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_135 (
      .A0(edt_bypass_in[135]),
      .A1(edt_scan_out[134]),
      .S0(edt_bypass),
      .Y(edt_scan_in[135]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_136 (
      .A0(edt_bypass_in[136]),
      .A1(edt_scan_out[135]),
      .S0(edt_bypass),
      .Y(edt_scan_in[136]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_137 (
      .A0(edt_bypass_in[137]),
      .A1(edt_scan_out[136]),
      .S0(edt_bypass),
      .Y(edt_scan_in[137]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_138 (
      .A0(edt_bypass_in[138]),
      .A1(edt_scan_out[137]),
      .S0(edt_bypass),
      .Y(edt_scan_in[138]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_139 (
      .A0(edt_bypass_in[139]),
      .A1(edt_scan_out[138]),
      .S0(edt_bypass),
      .Y(edt_scan_in[139]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_140 (
      .A0(edt_bypass_in[140]),
      .A1(edt_scan_out[139]),
      .S0(edt_bypass),
      .Y(edt_scan_in[140]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_141 (
      .A0(edt_bypass_in[141]),
      .A1(edt_scan_out[140]),
      .S0(edt_bypass),
      .Y(edt_scan_in[141]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_142 (
      .A0(edt_bypass_in[142]),
      .A1(edt_scan_out[141]),
      .S0(edt_bypass),
      .Y(edt_scan_in[142]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_143 (
      .A0(edt_bypass_in[143]),
      .A1(edt_scan_out[142]),
      .S0(edt_bypass),
      .Y(edt_scan_in[143]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_144 (
      .A0(edt_bypass_in[144]),
      .A1(edt_scan_out[143]),
      .S0(edt_bypass),
      .Y(edt_scan_in[144]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_145 (
      .A0(edt_bypass_in[145]),
      .A1(edt_scan_out[144]),
      .S0(edt_bypass),
      .Y(edt_scan_in[145]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_146 (
      .A0(edt_bypass_in[146]),
      .A1(edt_scan_out[145]),
      .S0(edt_bypass),
      .Y(edt_scan_in[146]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_147 (
      .A0(edt_bypass_in[147]),
      .A1(edt_scan_out[146]),
      .S0(edt_bypass),
      .Y(edt_scan_in[147]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_148 (
      .A0(edt_bypass_in[148]),
      .A1(edt_scan_out[147]),
      .S0(edt_bypass),
      .Y(edt_scan_in[148]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_149 (
      .A0(edt_bypass_in[149]),
      .A1(edt_scan_out[148]),
      .S0(edt_bypass),
      .Y(edt_scan_in[149]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_150 (
      .A0(edt_bypass_in[150]),
      .A1(edt_scan_out[149]),
      .S0(edt_bypass),
      .Y(edt_scan_in[150]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_151 (
      .A0(edt_bypass_in[151]),
      .A1(edt_scan_out[150]),
      .S0(edt_bypass),
      .Y(edt_scan_in[151]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_152 (
      .A0(edt_bypass_in[152]),
      .A1(edt_scan_out[151]),
      .S0(edt_bypass),
      .Y(edt_scan_in[152]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_153 (
      .A0(edt_bypass_in[153]),
      .A1(edt_scan_out[152]),
      .S0(edt_bypass),
      .Y(edt_scan_in[153]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_154 (
      .A0(edt_bypass_in[154]),
      .A1(edt_scan_out[153]),
      .S0(edt_bypass),
      .Y(edt_scan_in[154]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_155 (
      .A0(edt_bypass_in[155]),
      .A1(edt_scan_out[154]),
      .S0(edt_bypass),
      .Y(edt_scan_in[155]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_156 (
      .A0(edt_bypass_in[156]),
      .A1(edt_scan_out[155]),
      .S0(edt_bypass),
      .Y(edt_scan_in[156]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_157 (
      .A0(edt_bypass_in[157]),
      .A1(edt_scan_out[156]),
      .S0(edt_bypass),
      .Y(edt_scan_in[157]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_158 (
      .A0(edt_bypass_in[158]),
      .A1(edt_scan_out[157]),
      .S0(edt_bypass),
      .Y(edt_scan_in[158]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_159 (
      .A0(edt_bypass_in[159]),
      .A1(edt_scan_out[158]),
      .S0(edt_bypass),
      .Y(edt_scan_in[159]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_160 (
      .A0(edt_bypass_in[160]),
      .A1(edt_scan_out[159]),
      .S0(edt_bypass),
      .Y(edt_scan_in[160]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_161 (
      .A0(edt_bypass_in[161]),
      .A1(edt_scan_out[160]),
      .S0(edt_bypass),
      .Y(edt_scan_in[161]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_162 (
      .A0(edt_bypass_in[162]),
      .A1(edt_scan_out[161]),
      .S0(edt_bypass),
      .Y(edt_scan_in[162]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_163 (
      .A0(edt_bypass_in[163]),
      .A1(edt_scan_out[162]),
      .S0(edt_bypass),
      .Y(edt_scan_in[163]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_164 (
      .A0(edt_bypass_in[164]),
      .A1(edt_scan_out[163]),
      .S0(edt_bypass),
      .Y(edt_scan_in[164]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_165 (
      .A0(edt_bypass_in[165]),
      .A1(edt_scan_out[164]),
      .S0(edt_bypass),
      .Y(edt_scan_in[165]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_166 (
      .A0(edt_bypass_in[166]),
      .A1(edt_scan_out[165]),
      .S0(edt_bypass),
      .Y(edt_scan_in[166]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_167 (
      .A0(edt_bypass_in[167]),
      .A1(edt_scan_out[166]),
      .S0(edt_bypass),
      .Y(edt_scan_in[167]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_168 (
      .A0(edt_bypass_in[168]),
      .A1(edt_scan_out[167]),
      .S0(edt_bypass),
      .Y(edt_scan_in[168]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_169 (
      .A0(edt_bypass_in[169]),
      .A1(edt_scan_out[168]),
      .S0(edt_bypass),
      .Y(edt_scan_in[169]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_170 (
      .A0(edt_bypass_in[170]),
      .A1(edt_scan_out[169]),
      .S0(edt_bypass),
      .Y(edt_scan_in[170]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_171 (
      .A0(edt_bypass_in[171]),
      .A1(edt_scan_out[170]),
      .S0(edt_bypass),
      .Y(edt_scan_in[171]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_172 (
      .A0(edt_bypass_in[172]),
      .A1(edt_scan_out[171]),
      .S0(edt_bypass),
      .Y(edt_scan_in[172]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_173 (
      .A0(edt_bypass_in[173]),
      .A1(edt_scan_out[172]),
      .S0(edt_bypass),
      .Y(edt_scan_in[173]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_174 (
      .A0(edt_bypass_in[174]),
      .A1(edt_scan_out[173]),
      .S0(edt_bypass),
      .Y(edt_scan_in[174]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_175 (
      .A0(edt_bypass_in[175]),
      .A1(edt_scan_out[174]),
      .S0(edt_bypass),
      .Y(edt_scan_in[175]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_176 (
      .A0(edt_bypass_in[176]),
      .A1(edt_scan_out[175]),
      .S0(edt_bypass),
      .Y(edt_scan_in[176]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_177 (
      .A0(edt_bypass_in[177]),
      .A1(edt_scan_out[176]),
      .S0(edt_bypass),
      .Y(edt_scan_in[177]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_178 (
      .A0(edt_bypass_in[178]),
      .A1(edt_scan_out[177]),
      .S0(edt_bypass),
      .Y(edt_scan_in[178]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_179 (
      .A0(edt_bypass_in[179]),
      .A1(edt_scan_out[178]),
      .S0(edt_bypass),
      .Y(edt_scan_in[179]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_180 (
      .A0(edt_bypass_in[180]),
      .A1(edt_scan_out[179]),
      .S0(edt_bypass),
      .Y(edt_scan_in[180]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_181 (
      .A0(edt_bypass_in[181]),
      .A1(edt_scan_out[180]),
      .S0(edt_bypass),
      .Y(edt_scan_in[181]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_182 (
      .A0(edt_bypass_in[182]),
      .A1(edt_scan_out[181]),
      .S0(edt_bypass),
      .Y(edt_scan_in[182]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_183 (
      .A0(edt_bypass_in[183]),
      .A1(edt_scan_out[182]),
      .S0(edt_bypass),
      .Y(edt_scan_in[183]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_184 (
      .A0(edt_bypass_in[184]),
      .A1(edt_scan_out[183]),
      .S0(edt_bypass),
      .Y(edt_scan_in[184]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_185 (
      .A0(edt_bypass_in[185]),
      .A1(edt_scan_out[184]),
      .S0(edt_bypass),
      .Y(edt_scan_in[185]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_186 (
      .A0(edt_bypass_in[186]),
      .A1(edt_scan_out[185]),
      .S0(edt_bypass),
      .Y(edt_scan_in[186]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_187 (
      .A0(edt_bypass_in[187]),
      .A1(edt_scan_out[186]),
      .S0(edt_bypass),
      .Y(edt_scan_in[187]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_188 (
      .A0(edt_bypass_in[188]),
      .A1(edt_scan_out[187]),
      .S0(edt_bypass),
      .Y(edt_scan_in[188]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_189 (
      .A0(edt_bypass_in[189]),
      .A1(edt_scan_out[188]),
      .S0(edt_bypass),
      .Y(edt_scan_in[189]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_190 (
      .A0(edt_bypass_in[190]),
      .A1(edt_scan_out[189]),
      .S0(edt_bypass),
      .Y(edt_scan_in[190]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_191 (
      .A0(edt_bypass_in[191]),
      .A1(edt_scan_out[190]),
      .S0(edt_bypass),
      .Y(edt_scan_in[191]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_192 (
      .A0(edt_bypass_in[192]),
      .A1(edt_scan_out[191]),
      .S0(edt_bypass),
      .Y(edt_scan_in[192]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_193 (
      .A0(edt_bypass_in[193]),
      .A1(edt_scan_out[192]),
      .S0(edt_bypass),
      .Y(edt_scan_in[193]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_194 (
      .A0(edt_bypass_in[194]),
      .A1(edt_scan_out[193]),
      .S0(edt_bypass),
      .Y(edt_scan_in[194]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_195 (
      .A0(edt_bypass_in[195]),
      .A1(edt_scan_out[194]),
      .S0(edt_bypass),
      .Y(edt_scan_in[195]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_196 (
      .A0(edt_bypass_in[196]),
      .A1(edt_scan_out[195]),
      .S0(edt_bypass),
      .Y(edt_scan_in[196]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_197 (
      .A0(edt_bypass_in[197]),
      .A1(edt_scan_out[196]),
      .S0(edt_bypass),
      .Y(edt_scan_in[197]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_198 (
      .A0(edt_bypass_in[198]),
      .A1(edt_scan_out[197]),
      .S0(edt_bypass),
      .Y(edt_scan_in[198]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_199 (
      .A0(edt_bypass_in[199]),
      .A1(edt_scan_out[198]),
      .S0(edt_bypass),
      .Y(edt_scan_in[199]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_200 (
      .A0(edt_bypass_in[200]),
      .A1(edt_scan_out[199]),
      .S0(edt_bypass),
      .Y(edt_scan_in[200]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_201 (
      .A0(edt_bypass_in[201]),
      .A1(edt_scan_out[200]),
      .S0(edt_bypass),
      .Y(edt_scan_in[201]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_202 (
      .A0(edt_bypass_in[202]),
      .A1(edt_scan_out[201]),
      .S0(edt_bypass),
      .Y(edt_scan_in[202]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_203 (
      .A0(edt_bypass_in[203]),
      .A1(edt_scan_out[202]),
      .S0(edt_bypass),
      .Y(edt_scan_in[203]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_204 (
      .A0(edt_bypass_in[204]),
      .A1(edt_scan_out[203]),
      .S0(edt_bypass),
      .Y(edt_scan_in[204]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_205 (
      .A0(edt_bypass_in[205]),
      .A1(edt_scan_out[204]),
      .S0(edt_bypass),
      .Y(edt_scan_in[205]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_206 (
      .A0(edt_bypass_in[206]),
      .A1(edt_scan_out[205]),
      .S0(edt_bypass),
      .Y(edt_scan_in[206]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_207 (
      .A0(edt_bypass_in[207]),
      .A1(edt_scan_out[206]),
      .S0(edt_bypass),
      .Y(edt_scan_in[207]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_208 (
      .A0(edt_bypass_in[208]),
      .A1(edt_scan_out[207]),
      .S0(edt_bypass),
      .Y(edt_scan_in[208]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_209 (
      .A0(edt_bypass_in[209]),
      .A1(edt_scan_out[208]),
      .S0(edt_bypass),
      .Y(edt_scan_in[209]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_210 (
      .A0(edt_bypass_in[210]),
      .A1(edt_scan_out[209]),
      .S0(edt_bypass),
      .Y(edt_scan_in[210]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_211 (
      .A0(edt_bypass_in[211]),
      .A1(edt_scan_out[210]),
      .S0(edt_bypass),
      .Y(edt_scan_in[211]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_212 (
      .A0(edt_bypass_in[212]),
      .A1(edt_scan_out[211]),
      .S0(edt_bypass),
      .Y(edt_scan_in[212]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_213 (
      .A0(edt_bypass_in[213]),
      .A1(edt_scan_out[212]),
      .S0(edt_bypass),
      .Y(edt_scan_in[213]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_214 (
      .A0(edt_bypass_in[214]),
      .A1(edt_scan_out[213]),
      .S0(edt_bypass),
      .Y(edt_scan_in[214]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_215 (
      .A0(edt_bypass_in[215]),
      .A1(edt_scan_out[214]),
      .S0(edt_bypass),
      .Y(edt_scan_in[215]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_216 (
      .A0(edt_bypass_in[216]),
      .A1(edt_scan_out[215]),
      .S0(edt_bypass),
      .Y(edt_scan_in[216]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_217 (
      .A0(edt_bypass_in[217]),
      .A1(edt_scan_out[216]),
      .S0(edt_bypass),
      .Y(edt_scan_in[217]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_218 (
      .A0(edt_bypass_in[218]),
      .A1(edt_scan_out[217]),
      .S0(edt_bypass),
      .Y(edt_scan_in[218]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_219 (
      .A0(edt_bypass_in[219]),
      .A1(edt_scan_out[218]),
      .S0(edt_bypass),
      .Y(edt_scan_in[219]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_220 (
      .A0(edt_bypass_in[220]),
      .A1(edt_scan_out[219]),
      .S0(edt_bypass),
      .Y(edt_scan_in[220]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_221 (
      .A0(edt_bypass_in[221]),
      .A1(edt_scan_out[220]),
      .S0(edt_bypass),
      .Y(edt_scan_in[221]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_222 (
      .A0(edt_bypass_in[222]),
      .A1(edt_scan_out[221]),
      .S0(edt_bypass),
      .Y(edt_scan_in[222]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_223 (
      .A0(edt_bypass_in[223]),
      .A1(edt_scan_out[222]),
      .S0(edt_bypass),
      .Y(edt_scan_in[223]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_224 (
      .A0(edt_bypass_in[224]),
      .A1(edt_scan_out[223]),
      .S0(edt_bypass),
      .Y(edt_scan_in[224]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_225 (
      .A0(edt_bypass_in[225]),
      .A1(edt_scan_out[224]),
      .S0(edt_bypass),
      .Y(edt_scan_in[225]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_226 (
      .A0(edt_bypass_in[226]),
      .A1(edt_scan_out[225]),
      .S0(edt_bypass),
      .Y(edt_scan_in[226]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_227 (
      .A0(edt_bypass_in[227]),
      .A1(edt_scan_out[226]),
      .S0(edt_bypass),
      .Y(edt_scan_in[227]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_228 (
      .A0(edt_bypass_in[228]),
      .A1(edt_scan_out[227]),
      .S0(edt_bypass),
      .Y(edt_scan_in[228]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_229 (
      .A0(edt_bypass_in[229]),
      .A1(edt_scan_out[228]),
      .S0(edt_bypass),
      .Y(edt_scan_in[229]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_230 (
      .A0(edt_bypass_in[230]),
      .A1(edt_scan_out[229]),
      .S0(edt_bypass),
      .Y(edt_scan_in[230]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_231 (
      .A0(edt_bypass_in[231]),
      .A1(edt_scan_out[230]),
      .S0(edt_bypass),
      .Y(edt_scan_in[231]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_232 (
      .A0(edt_bypass_in[232]),
      .A1(edt_scan_out[231]),
      .S0(edt_bypass),
      .Y(edt_scan_in[232]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_233 (
      .A0(edt_bypass_in[233]),
      .A1(edt_scan_out[232]),
      .S0(edt_bypass),
      .Y(edt_scan_in[233]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_234 (
      .A0(edt_bypass_in[234]),
      .A1(edt_scan_out[233]),
      .S0(edt_bypass),
      .Y(edt_scan_in[234]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_235 (
      .A0(edt_bypass_in[235]),
      .A1(edt_scan_out[234]),
      .S0(edt_bypass),
      .Y(edt_scan_in[235]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_236 (
      .A0(edt_bypass_in[236]),
      .A1(edt_scan_out[235]),
      .S0(edt_bypass),
      .Y(edt_scan_in[236]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_237 (
      .A0(edt_bypass_in[237]),
      .A1(edt_scan_out[236]),
      .S0(edt_bypass),
      .Y(edt_scan_in[237]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_238 (
      .A0(edt_bypass_in[238]),
      .A1(edt_scan_out[237]),
      .S0(edt_bypass),
      .Y(edt_scan_in[238]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_239 (
      .A0(edt_bypass_in[239]),
      .A1(edt_scan_out[238]),
      .S0(edt_bypass),
      .Y(edt_scan_in[239]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_240 (
      .A0(edt_bypass_in[240]),
      .A1(edt_scan_out[239]),
      .S0(edt_bypass),
      .Y(edt_scan_in[240]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_241 (
      .A0(edt_bypass_in[241]),
      .A1(edt_scan_out[240]),
      .S0(edt_bypass),
      .Y(edt_scan_in[241]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_242 (
      .A0(edt_bypass_in[242]),
      .A1(edt_scan_out[241]),
      .S0(edt_bypass),
      .Y(edt_scan_in[242]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_243 (
      .A0(edt_bypass_in[243]),
      .A1(edt_scan_out[242]),
      .S0(edt_bypass),
      .Y(edt_scan_in[243]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_244 (
      .A0(edt_bypass_in[244]),
      .A1(edt_scan_out[243]),
      .S0(edt_bypass),
      .Y(edt_scan_in[244]));
   mux21 tessent_persistent_cell_edt_scan_in_mux_245 (
      .A0(edt_bypass_in[245]),
      .A1(edt_scan_out[244]),
      .S0(edt_bypass),
      .Y(edt_scan_in[245]));
   mux21 tessent_persistent_cell_edt_channels_out_mux_0 (
      .A0(edt_bypass_out[0]),
      .A1(edt_scan_out[122]),
      .S0(edt_bypass),
      .Y(edt_channels_out[0]));
   mux21 tessent_persistent_cell_edt_channels_out_mux_1 (
      .A0(edt_bypass_out[1]),
      .A1(edt_scan_out[245]),
      .S0(edt_bypass),
      .Y(edt_channels_out[1]));
endmodule


module processor_core_logic_test_tessent_edt_EXT_EDT (
   input  wire         edt_clock,
   input  wire         edt_update,
   input  wire         scan_en,
   input  wire         edt_low_power_shift_en,
   input  wire         edt_bypass,
   input  wire [  1:0] edt_channels_in,
   output wire [  1:0] edt_channels_out,
   output wire [245:0] edt_scan_in,
   input  wire [245:0] edt_scan_out
);
   wire   [245:0] edt_decompressor_out;
   wire   [245:0] edt_bypass_in;
   wire   [  1:0] edt_bypass_out;
   wire   [122:0] masks_for_compactor_0;
   wire   [122:0] masks_for_compactor_1;
   wire   [  1:0] edt_channels_out_from_controller;
   wire           edt_clock_buf_out;
   wire           edt_update_buf_out;
   wire           scan_en_buf_out;
   wire           edt_bypass_buf_out;
   wire           edt_low_power_shift_en_buf_out;
   wire   [  1:0] edt_channels_in_buf_out;
   wire   [  1:0] edt_channels_out_buf_in;
   wire   [245:0] edt_scan_in_buf_in;
   wire   [245:0] edt_scan_out_buf_out;

   clock_buf02 tessent_persistent_cell_edt_clock_buf (.A(edt_clock),
                                                      .Y(edt_clock_buf_out));
   buf02 tessent_persistent_cell_edt_update_buf (.A(edt_update),
                                                 .Y(edt_update_buf_out));
   buf02 tessent_persistent_cell_scan_en_buf (.A(scan_en),
                                              .Y(scan_en_buf_out));
   buf02 tessent_persistent_cell_edt_bypass_buf (.A(edt_bypass),
                                                 .Y(edt_bypass_buf_out));
   buf02 tessent_persistent_cell_edt_low_power_shift_en_buf (.A(edt_low_power_shift_en),
                                                             .Y(edt_low_power_shift_en_buf_out));

   buf02 tessent_persistent_cell_edt_channels_in_0_buf (.A(edt_channels_in[0]),
                                                        .Y(edt_channels_in_buf_out[0]));
   buf02 tessent_persistent_cell_edt_channels_in_1_buf (.A(edt_channels_in[1]),
                                                        .Y(edt_channels_in_buf_out[1]));

   buf02 tessent_persistent_cell_edt_channels_out_0_buf (.A(edt_channels_out_buf_in[0]),
                                                         .Y(edt_channels_out[0]));
   buf02 tessent_persistent_cell_edt_channels_out_1_buf (.A(edt_channels_out_buf_in[1]),
                                                         .Y(edt_channels_out[1]));

   buf02 tessent_persistent_cell_edt_scan_in_0_buf (.A(edt_scan_in_buf_in[0]),
                                                    .Y(edt_scan_in[0]));
   buf02 tessent_persistent_cell_edt_scan_in_1_buf (.A(edt_scan_in_buf_in[1]),
                                                    .Y(edt_scan_in[1]));
   buf02 tessent_persistent_cell_edt_scan_in_2_buf (.A(edt_scan_in_buf_in[2]),
                                                    .Y(edt_scan_in[2]));
   buf02 tessent_persistent_cell_edt_scan_in_3_buf (.A(edt_scan_in_buf_in[3]),
                                                    .Y(edt_scan_in[3]));
   buf02 tessent_persistent_cell_edt_scan_in_4_buf (.A(edt_scan_in_buf_in[4]),
                                                    .Y(edt_scan_in[4]));
   buf02 tessent_persistent_cell_edt_scan_in_5_buf (.A(edt_scan_in_buf_in[5]),
                                                    .Y(edt_scan_in[5]));
   buf02 tessent_persistent_cell_edt_scan_in_6_buf (.A(edt_scan_in_buf_in[6]),
                                                    .Y(edt_scan_in[6]));
   buf02 tessent_persistent_cell_edt_scan_in_7_buf (.A(edt_scan_in_buf_in[7]),
                                                    .Y(edt_scan_in[7]));
   buf02 tessent_persistent_cell_edt_scan_in_8_buf (.A(edt_scan_in_buf_in[8]),
                                                    .Y(edt_scan_in[8]));
   buf02 tessent_persistent_cell_edt_scan_in_9_buf (.A(edt_scan_in_buf_in[9]),
                                                    .Y(edt_scan_in[9]));
   buf02 tessent_persistent_cell_edt_scan_in_10_buf (.A(edt_scan_in_buf_in[10]),
                                                     .Y(edt_scan_in[10]));
   buf02 tessent_persistent_cell_edt_scan_in_11_buf (.A(edt_scan_in_buf_in[11]),
                                                     .Y(edt_scan_in[11]));
   buf02 tessent_persistent_cell_edt_scan_in_12_buf (.A(edt_scan_in_buf_in[12]),
                                                     .Y(edt_scan_in[12]));
   buf02 tessent_persistent_cell_edt_scan_in_13_buf (.A(edt_scan_in_buf_in[13]),
                                                     .Y(edt_scan_in[13]));
   buf02 tessent_persistent_cell_edt_scan_in_14_buf (.A(edt_scan_in_buf_in[14]),
                                                     .Y(edt_scan_in[14]));
   buf02 tessent_persistent_cell_edt_scan_in_15_buf (.A(edt_scan_in_buf_in[15]),
                                                     .Y(edt_scan_in[15]));
   buf02 tessent_persistent_cell_edt_scan_in_16_buf (.A(edt_scan_in_buf_in[16]),
                                                     .Y(edt_scan_in[16]));
   buf02 tessent_persistent_cell_edt_scan_in_17_buf (.A(edt_scan_in_buf_in[17]),
                                                     .Y(edt_scan_in[17]));
   buf02 tessent_persistent_cell_edt_scan_in_18_buf (.A(edt_scan_in_buf_in[18]),
                                                     .Y(edt_scan_in[18]));
   buf02 tessent_persistent_cell_edt_scan_in_19_buf (.A(edt_scan_in_buf_in[19]),
                                                     .Y(edt_scan_in[19]));
   buf02 tessent_persistent_cell_edt_scan_in_20_buf (.A(edt_scan_in_buf_in[20]),
                                                     .Y(edt_scan_in[20]));
   buf02 tessent_persistent_cell_edt_scan_in_21_buf (.A(edt_scan_in_buf_in[21]),
                                                     .Y(edt_scan_in[21]));
   buf02 tessent_persistent_cell_edt_scan_in_22_buf (.A(edt_scan_in_buf_in[22]),
                                                     .Y(edt_scan_in[22]));
   buf02 tessent_persistent_cell_edt_scan_in_23_buf (.A(edt_scan_in_buf_in[23]),
                                                     .Y(edt_scan_in[23]));
   buf02 tessent_persistent_cell_edt_scan_in_24_buf (.A(edt_scan_in_buf_in[24]),
                                                     .Y(edt_scan_in[24]));
   buf02 tessent_persistent_cell_edt_scan_in_25_buf (.A(edt_scan_in_buf_in[25]),
                                                     .Y(edt_scan_in[25]));
   buf02 tessent_persistent_cell_edt_scan_in_26_buf (.A(edt_scan_in_buf_in[26]),
                                                     .Y(edt_scan_in[26]));
   buf02 tessent_persistent_cell_edt_scan_in_27_buf (.A(edt_scan_in_buf_in[27]),
                                                     .Y(edt_scan_in[27]));
   buf02 tessent_persistent_cell_edt_scan_in_28_buf (.A(edt_scan_in_buf_in[28]),
                                                     .Y(edt_scan_in[28]));
   buf02 tessent_persistent_cell_edt_scan_in_29_buf (.A(edt_scan_in_buf_in[29]),
                                                     .Y(edt_scan_in[29]));
   buf02 tessent_persistent_cell_edt_scan_in_30_buf (.A(edt_scan_in_buf_in[30]),
                                                     .Y(edt_scan_in[30]));
   buf02 tessent_persistent_cell_edt_scan_in_31_buf (.A(edt_scan_in_buf_in[31]),
                                                     .Y(edt_scan_in[31]));
   buf02 tessent_persistent_cell_edt_scan_in_32_buf (.A(edt_scan_in_buf_in[32]),
                                                     .Y(edt_scan_in[32]));
   buf02 tessent_persistent_cell_edt_scan_in_33_buf (.A(edt_scan_in_buf_in[33]),
                                                     .Y(edt_scan_in[33]));
   buf02 tessent_persistent_cell_edt_scan_in_34_buf (.A(edt_scan_in_buf_in[34]),
                                                     .Y(edt_scan_in[34]));
   buf02 tessent_persistent_cell_edt_scan_in_35_buf (.A(edt_scan_in_buf_in[35]),
                                                     .Y(edt_scan_in[35]));
   buf02 tessent_persistent_cell_edt_scan_in_36_buf (.A(edt_scan_in_buf_in[36]),
                                                     .Y(edt_scan_in[36]));
   buf02 tessent_persistent_cell_edt_scan_in_37_buf (.A(edt_scan_in_buf_in[37]),
                                                     .Y(edt_scan_in[37]));
   buf02 tessent_persistent_cell_edt_scan_in_38_buf (.A(edt_scan_in_buf_in[38]),
                                                     .Y(edt_scan_in[38]));
   buf02 tessent_persistent_cell_edt_scan_in_39_buf (.A(edt_scan_in_buf_in[39]),
                                                     .Y(edt_scan_in[39]));
   buf02 tessent_persistent_cell_edt_scan_in_40_buf (.A(edt_scan_in_buf_in[40]),
                                                     .Y(edt_scan_in[40]));
   buf02 tessent_persistent_cell_edt_scan_in_41_buf (.A(edt_scan_in_buf_in[41]),
                                                     .Y(edt_scan_in[41]));
   buf02 tessent_persistent_cell_edt_scan_in_42_buf (.A(edt_scan_in_buf_in[42]),
                                                     .Y(edt_scan_in[42]));
   buf02 tessent_persistent_cell_edt_scan_in_43_buf (.A(edt_scan_in_buf_in[43]),
                                                     .Y(edt_scan_in[43]));
   buf02 tessent_persistent_cell_edt_scan_in_44_buf (.A(edt_scan_in_buf_in[44]),
                                                     .Y(edt_scan_in[44]));
   buf02 tessent_persistent_cell_edt_scan_in_45_buf (.A(edt_scan_in_buf_in[45]),
                                                     .Y(edt_scan_in[45]));
   buf02 tessent_persistent_cell_edt_scan_in_46_buf (.A(edt_scan_in_buf_in[46]),
                                                     .Y(edt_scan_in[46]));
   buf02 tessent_persistent_cell_edt_scan_in_47_buf (.A(edt_scan_in_buf_in[47]),
                                                     .Y(edt_scan_in[47]));
   buf02 tessent_persistent_cell_edt_scan_in_48_buf (.A(edt_scan_in_buf_in[48]),
                                                     .Y(edt_scan_in[48]));
   buf02 tessent_persistent_cell_edt_scan_in_49_buf (.A(edt_scan_in_buf_in[49]),
                                                     .Y(edt_scan_in[49]));
   buf02 tessent_persistent_cell_edt_scan_in_50_buf (.A(edt_scan_in_buf_in[50]),
                                                     .Y(edt_scan_in[50]));
   buf02 tessent_persistent_cell_edt_scan_in_51_buf (.A(edt_scan_in_buf_in[51]),
                                                     .Y(edt_scan_in[51]));
   buf02 tessent_persistent_cell_edt_scan_in_52_buf (.A(edt_scan_in_buf_in[52]),
                                                     .Y(edt_scan_in[52]));
   buf02 tessent_persistent_cell_edt_scan_in_53_buf (.A(edt_scan_in_buf_in[53]),
                                                     .Y(edt_scan_in[53]));
   buf02 tessent_persistent_cell_edt_scan_in_54_buf (.A(edt_scan_in_buf_in[54]),
                                                     .Y(edt_scan_in[54]));
   buf02 tessent_persistent_cell_edt_scan_in_55_buf (.A(edt_scan_in_buf_in[55]),
                                                     .Y(edt_scan_in[55]));
   buf02 tessent_persistent_cell_edt_scan_in_56_buf (.A(edt_scan_in_buf_in[56]),
                                                     .Y(edt_scan_in[56]));
   buf02 tessent_persistent_cell_edt_scan_in_57_buf (.A(edt_scan_in_buf_in[57]),
                                                     .Y(edt_scan_in[57]));
   buf02 tessent_persistent_cell_edt_scan_in_58_buf (.A(edt_scan_in_buf_in[58]),
                                                     .Y(edt_scan_in[58]));
   buf02 tessent_persistent_cell_edt_scan_in_59_buf (.A(edt_scan_in_buf_in[59]),
                                                     .Y(edt_scan_in[59]));
   buf02 tessent_persistent_cell_edt_scan_in_60_buf (.A(edt_scan_in_buf_in[60]),
                                                     .Y(edt_scan_in[60]));
   buf02 tessent_persistent_cell_edt_scan_in_61_buf (.A(edt_scan_in_buf_in[61]),
                                                     .Y(edt_scan_in[61]));
   buf02 tessent_persistent_cell_edt_scan_in_62_buf (.A(edt_scan_in_buf_in[62]),
                                                     .Y(edt_scan_in[62]));
   buf02 tessent_persistent_cell_edt_scan_in_63_buf (.A(edt_scan_in_buf_in[63]),
                                                     .Y(edt_scan_in[63]));
   buf02 tessent_persistent_cell_edt_scan_in_64_buf (.A(edt_scan_in_buf_in[64]),
                                                     .Y(edt_scan_in[64]));
   buf02 tessent_persistent_cell_edt_scan_in_65_buf (.A(edt_scan_in_buf_in[65]),
                                                     .Y(edt_scan_in[65]));
   buf02 tessent_persistent_cell_edt_scan_in_66_buf (.A(edt_scan_in_buf_in[66]),
                                                     .Y(edt_scan_in[66]));
   buf02 tessent_persistent_cell_edt_scan_in_67_buf (.A(edt_scan_in_buf_in[67]),
                                                     .Y(edt_scan_in[67]));
   buf02 tessent_persistent_cell_edt_scan_in_68_buf (.A(edt_scan_in_buf_in[68]),
                                                     .Y(edt_scan_in[68]));
   buf02 tessent_persistent_cell_edt_scan_in_69_buf (.A(edt_scan_in_buf_in[69]),
                                                     .Y(edt_scan_in[69]));
   buf02 tessent_persistent_cell_edt_scan_in_70_buf (.A(edt_scan_in_buf_in[70]),
                                                     .Y(edt_scan_in[70]));
   buf02 tessent_persistent_cell_edt_scan_in_71_buf (.A(edt_scan_in_buf_in[71]),
                                                     .Y(edt_scan_in[71]));
   buf02 tessent_persistent_cell_edt_scan_in_72_buf (.A(edt_scan_in_buf_in[72]),
                                                     .Y(edt_scan_in[72]));
   buf02 tessent_persistent_cell_edt_scan_in_73_buf (.A(edt_scan_in_buf_in[73]),
                                                     .Y(edt_scan_in[73]));
   buf02 tessent_persistent_cell_edt_scan_in_74_buf (.A(edt_scan_in_buf_in[74]),
                                                     .Y(edt_scan_in[74]));
   buf02 tessent_persistent_cell_edt_scan_in_75_buf (.A(edt_scan_in_buf_in[75]),
                                                     .Y(edt_scan_in[75]));
   buf02 tessent_persistent_cell_edt_scan_in_76_buf (.A(edt_scan_in_buf_in[76]),
                                                     .Y(edt_scan_in[76]));
   buf02 tessent_persistent_cell_edt_scan_in_77_buf (.A(edt_scan_in_buf_in[77]),
                                                     .Y(edt_scan_in[77]));
   buf02 tessent_persistent_cell_edt_scan_in_78_buf (.A(edt_scan_in_buf_in[78]),
                                                     .Y(edt_scan_in[78]));
   buf02 tessent_persistent_cell_edt_scan_in_79_buf (.A(edt_scan_in_buf_in[79]),
                                                     .Y(edt_scan_in[79]));
   buf02 tessent_persistent_cell_edt_scan_in_80_buf (.A(edt_scan_in_buf_in[80]),
                                                     .Y(edt_scan_in[80]));
   buf02 tessent_persistent_cell_edt_scan_in_81_buf (.A(edt_scan_in_buf_in[81]),
                                                     .Y(edt_scan_in[81]));
   buf02 tessent_persistent_cell_edt_scan_in_82_buf (.A(edt_scan_in_buf_in[82]),
                                                     .Y(edt_scan_in[82]));
   buf02 tessent_persistent_cell_edt_scan_in_83_buf (.A(edt_scan_in_buf_in[83]),
                                                     .Y(edt_scan_in[83]));
   buf02 tessent_persistent_cell_edt_scan_in_84_buf (.A(edt_scan_in_buf_in[84]),
                                                     .Y(edt_scan_in[84]));
   buf02 tessent_persistent_cell_edt_scan_in_85_buf (.A(edt_scan_in_buf_in[85]),
                                                     .Y(edt_scan_in[85]));
   buf02 tessent_persistent_cell_edt_scan_in_86_buf (.A(edt_scan_in_buf_in[86]),
                                                     .Y(edt_scan_in[86]));
   buf02 tessent_persistent_cell_edt_scan_in_87_buf (.A(edt_scan_in_buf_in[87]),
                                                     .Y(edt_scan_in[87]));
   buf02 tessent_persistent_cell_edt_scan_in_88_buf (.A(edt_scan_in_buf_in[88]),
                                                     .Y(edt_scan_in[88]));
   buf02 tessent_persistent_cell_edt_scan_in_89_buf (.A(edt_scan_in_buf_in[89]),
                                                     .Y(edt_scan_in[89]));
   buf02 tessent_persistent_cell_edt_scan_in_90_buf (.A(edt_scan_in_buf_in[90]),
                                                     .Y(edt_scan_in[90]));
   buf02 tessent_persistent_cell_edt_scan_in_91_buf (.A(edt_scan_in_buf_in[91]),
                                                     .Y(edt_scan_in[91]));
   buf02 tessent_persistent_cell_edt_scan_in_92_buf (.A(edt_scan_in_buf_in[92]),
                                                     .Y(edt_scan_in[92]));
   buf02 tessent_persistent_cell_edt_scan_in_93_buf (.A(edt_scan_in_buf_in[93]),
                                                     .Y(edt_scan_in[93]));
   buf02 tessent_persistent_cell_edt_scan_in_94_buf (.A(edt_scan_in_buf_in[94]),
                                                     .Y(edt_scan_in[94]));
   buf02 tessent_persistent_cell_edt_scan_in_95_buf (.A(edt_scan_in_buf_in[95]),
                                                     .Y(edt_scan_in[95]));
   buf02 tessent_persistent_cell_edt_scan_in_96_buf (.A(edt_scan_in_buf_in[96]),
                                                     .Y(edt_scan_in[96]));
   buf02 tessent_persistent_cell_edt_scan_in_97_buf (.A(edt_scan_in_buf_in[97]),
                                                     .Y(edt_scan_in[97]));
   buf02 tessent_persistent_cell_edt_scan_in_98_buf (.A(edt_scan_in_buf_in[98]),
                                                     .Y(edt_scan_in[98]));
   buf02 tessent_persistent_cell_edt_scan_in_99_buf (.A(edt_scan_in_buf_in[99]),
                                                     .Y(edt_scan_in[99]));
   buf02 tessent_persistent_cell_edt_scan_in_100_buf (.A(edt_scan_in_buf_in[100]),
                                                      .Y(edt_scan_in[100]));
   buf02 tessent_persistent_cell_edt_scan_in_101_buf (.A(edt_scan_in_buf_in[101]),
                                                      .Y(edt_scan_in[101]));
   buf02 tessent_persistent_cell_edt_scan_in_102_buf (.A(edt_scan_in_buf_in[102]),
                                                      .Y(edt_scan_in[102]));
   buf02 tessent_persistent_cell_edt_scan_in_103_buf (.A(edt_scan_in_buf_in[103]),
                                                      .Y(edt_scan_in[103]));
   buf02 tessent_persistent_cell_edt_scan_in_104_buf (.A(edt_scan_in_buf_in[104]),
                                                      .Y(edt_scan_in[104]));
   buf02 tessent_persistent_cell_edt_scan_in_105_buf (.A(edt_scan_in_buf_in[105]),
                                                      .Y(edt_scan_in[105]));
   buf02 tessent_persistent_cell_edt_scan_in_106_buf (.A(edt_scan_in_buf_in[106]),
                                                      .Y(edt_scan_in[106]));
   buf02 tessent_persistent_cell_edt_scan_in_107_buf (.A(edt_scan_in_buf_in[107]),
                                                      .Y(edt_scan_in[107]));
   buf02 tessent_persistent_cell_edt_scan_in_108_buf (.A(edt_scan_in_buf_in[108]),
                                                      .Y(edt_scan_in[108]));
   buf02 tessent_persistent_cell_edt_scan_in_109_buf (.A(edt_scan_in_buf_in[109]),
                                                      .Y(edt_scan_in[109]));
   buf02 tessent_persistent_cell_edt_scan_in_110_buf (.A(edt_scan_in_buf_in[110]),
                                                      .Y(edt_scan_in[110]));
   buf02 tessent_persistent_cell_edt_scan_in_111_buf (.A(edt_scan_in_buf_in[111]),
                                                      .Y(edt_scan_in[111]));
   buf02 tessent_persistent_cell_edt_scan_in_112_buf (.A(edt_scan_in_buf_in[112]),
                                                      .Y(edt_scan_in[112]));
   buf02 tessent_persistent_cell_edt_scan_in_113_buf (.A(edt_scan_in_buf_in[113]),
                                                      .Y(edt_scan_in[113]));
   buf02 tessent_persistent_cell_edt_scan_in_114_buf (.A(edt_scan_in_buf_in[114]),
                                                      .Y(edt_scan_in[114]));
   buf02 tessent_persistent_cell_edt_scan_in_115_buf (.A(edt_scan_in_buf_in[115]),
                                                      .Y(edt_scan_in[115]));
   buf02 tessent_persistent_cell_edt_scan_in_116_buf (.A(edt_scan_in_buf_in[116]),
                                                      .Y(edt_scan_in[116]));
   buf02 tessent_persistent_cell_edt_scan_in_117_buf (.A(edt_scan_in_buf_in[117]),
                                                      .Y(edt_scan_in[117]));
   buf02 tessent_persistent_cell_edt_scan_in_118_buf (.A(edt_scan_in_buf_in[118]),
                                                      .Y(edt_scan_in[118]));
   buf02 tessent_persistent_cell_edt_scan_in_119_buf (.A(edt_scan_in_buf_in[119]),
                                                      .Y(edt_scan_in[119]));
   buf02 tessent_persistent_cell_edt_scan_in_120_buf (.A(edt_scan_in_buf_in[120]),
                                                      .Y(edt_scan_in[120]));
   buf02 tessent_persistent_cell_edt_scan_in_121_buf (.A(edt_scan_in_buf_in[121]),
                                                      .Y(edt_scan_in[121]));
   buf02 tessent_persistent_cell_edt_scan_in_122_buf (.A(edt_scan_in_buf_in[122]),
                                                      .Y(edt_scan_in[122]));
   buf02 tessent_persistent_cell_edt_scan_in_123_buf (.A(edt_scan_in_buf_in[123]),
                                                      .Y(edt_scan_in[123]));
   buf02 tessent_persistent_cell_edt_scan_in_124_buf (.A(edt_scan_in_buf_in[124]),
                                                      .Y(edt_scan_in[124]));
   buf02 tessent_persistent_cell_edt_scan_in_125_buf (.A(edt_scan_in_buf_in[125]),
                                                      .Y(edt_scan_in[125]));
   buf02 tessent_persistent_cell_edt_scan_in_126_buf (.A(edt_scan_in_buf_in[126]),
                                                      .Y(edt_scan_in[126]));
   buf02 tessent_persistent_cell_edt_scan_in_127_buf (.A(edt_scan_in_buf_in[127]),
                                                      .Y(edt_scan_in[127]));
   buf02 tessent_persistent_cell_edt_scan_in_128_buf (.A(edt_scan_in_buf_in[128]),
                                                      .Y(edt_scan_in[128]));
   buf02 tessent_persistent_cell_edt_scan_in_129_buf (.A(edt_scan_in_buf_in[129]),
                                                      .Y(edt_scan_in[129]));
   buf02 tessent_persistent_cell_edt_scan_in_130_buf (.A(edt_scan_in_buf_in[130]),
                                                      .Y(edt_scan_in[130]));
   buf02 tessent_persistent_cell_edt_scan_in_131_buf (.A(edt_scan_in_buf_in[131]),
                                                      .Y(edt_scan_in[131]));
   buf02 tessent_persistent_cell_edt_scan_in_132_buf (.A(edt_scan_in_buf_in[132]),
                                                      .Y(edt_scan_in[132]));
   buf02 tessent_persistent_cell_edt_scan_in_133_buf (.A(edt_scan_in_buf_in[133]),
                                                      .Y(edt_scan_in[133]));
   buf02 tessent_persistent_cell_edt_scan_in_134_buf (.A(edt_scan_in_buf_in[134]),
                                                      .Y(edt_scan_in[134]));
   buf02 tessent_persistent_cell_edt_scan_in_135_buf (.A(edt_scan_in_buf_in[135]),
                                                      .Y(edt_scan_in[135]));
   buf02 tessent_persistent_cell_edt_scan_in_136_buf (.A(edt_scan_in_buf_in[136]),
                                                      .Y(edt_scan_in[136]));
   buf02 tessent_persistent_cell_edt_scan_in_137_buf (.A(edt_scan_in_buf_in[137]),
                                                      .Y(edt_scan_in[137]));
   buf02 tessent_persistent_cell_edt_scan_in_138_buf (.A(edt_scan_in_buf_in[138]),
                                                      .Y(edt_scan_in[138]));
   buf02 tessent_persistent_cell_edt_scan_in_139_buf (.A(edt_scan_in_buf_in[139]),
                                                      .Y(edt_scan_in[139]));
   buf02 tessent_persistent_cell_edt_scan_in_140_buf (.A(edt_scan_in_buf_in[140]),
                                                      .Y(edt_scan_in[140]));
   buf02 tessent_persistent_cell_edt_scan_in_141_buf (.A(edt_scan_in_buf_in[141]),
                                                      .Y(edt_scan_in[141]));
   buf02 tessent_persistent_cell_edt_scan_in_142_buf (.A(edt_scan_in_buf_in[142]),
                                                      .Y(edt_scan_in[142]));
   buf02 tessent_persistent_cell_edt_scan_in_143_buf (.A(edt_scan_in_buf_in[143]),
                                                      .Y(edt_scan_in[143]));
   buf02 tessent_persistent_cell_edt_scan_in_144_buf (.A(edt_scan_in_buf_in[144]),
                                                      .Y(edt_scan_in[144]));
   buf02 tessent_persistent_cell_edt_scan_in_145_buf (.A(edt_scan_in_buf_in[145]),
                                                      .Y(edt_scan_in[145]));
   buf02 tessent_persistent_cell_edt_scan_in_146_buf (.A(edt_scan_in_buf_in[146]),
                                                      .Y(edt_scan_in[146]));
   buf02 tessent_persistent_cell_edt_scan_in_147_buf (.A(edt_scan_in_buf_in[147]),
                                                      .Y(edt_scan_in[147]));
   buf02 tessent_persistent_cell_edt_scan_in_148_buf (.A(edt_scan_in_buf_in[148]),
                                                      .Y(edt_scan_in[148]));
   buf02 tessent_persistent_cell_edt_scan_in_149_buf (.A(edt_scan_in_buf_in[149]),
                                                      .Y(edt_scan_in[149]));
   buf02 tessent_persistent_cell_edt_scan_in_150_buf (.A(edt_scan_in_buf_in[150]),
                                                      .Y(edt_scan_in[150]));
   buf02 tessent_persistent_cell_edt_scan_in_151_buf (.A(edt_scan_in_buf_in[151]),
                                                      .Y(edt_scan_in[151]));
   buf02 tessent_persistent_cell_edt_scan_in_152_buf (.A(edt_scan_in_buf_in[152]),
                                                      .Y(edt_scan_in[152]));
   buf02 tessent_persistent_cell_edt_scan_in_153_buf (.A(edt_scan_in_buf_in[153]),
                                                      .Y(edt_scan_in[153]));
   buf02 tessent_persistent_cell_edt_scan_in_154_buf (.A(edt_scan_in_buf_in[154]),
                                                      .Y(edt_scan_in[154]));
   buf02 tessent_persistent_cell_edt_scan_in_155_buf (.A(edt_scan_in_buf_in[155]),
                                                      .Y(edt_scan_in[155]));
   buf02 tessent_persistent_cell_edt_scan_in_156_buf (.A(edt_scan_in_buf_in[156]),
                                                      .Y(edt_scan_in[156]));
   buf02 tessent_persistent_cell_edt_scan_in_157_buf (.A(edt_scan_in_buf_in[157]),
                                                      .Y(edt_scan_in[157]));
   buf02 tessent_persistent_cell_edt_scan_in_158_buf (.A(edt_scan_in_buf_in[158]),
                                                      .Y(edt_scan_in[158]));
   buf02 tessent_persistent_cell_edt_scan_in_159_buf (.A(edt_scan_in_buf_in[159]),
                                                      .Y(edt_scan_in[159]));
   buf02 tessent_persistent_cell_edt_scan_in_160_buf (.A(edt_scan_in_buf_in[160]),
                                                      .Y(edt_scan_in[160]));
   buf02 tessent_persistent_cell_edt_scan_in_161_buf (.A(edt_scan_in_buf_in[161]),
                                                      .Y(edt_scan_in[161]));
   buf02 tessent_persistent_cell_edt_scan_in_162_buf (.A(edt_scan_in_buf_in[162]),
                                                      .Y(edt_scan_in[162]));
   buf02 tessent_persistent_cell_edt_scan_in_163_buf (.A(edt_scan_in_buf_in[163]),
                                                      .Y(edt_scan_in[163]));
   buf02 tessent_persistent_cell_edt_scan_in_164_buf (.A(edt_scan_in_buf_in[164]),
                                                      .Y(edt_scan_in[164]));
   buf02 tessent_persistent_cell_edt_scan_in_165_buf (.A(edt_scan_in_buf_in[165]),
                                                      .Y(edt_scan_in[165]));
   buf02 tessent_persistent_cell_edt_scan_in_166_buf (.A(edt_scan_in_buf_in[166]),
                                                      .Y(edt_scan_in[166]));
   buf02 tessent_persistent_cell_edt_scan_in_167_buf (.A(edt_scan_in_buf_in[167]),
                                                      .Y(edt_scan_in[167]));
   buf02 tessent_persistent_cell_edt_scan_in_168_buf (.A(edt_scan_in_buf_in[168]),
                                                      .Y(edt_scan_in[168]));
   buf02 tessent_persistent_cell_edt_scan_in_169_buf (.A(edt_scan_in_buf_in[169]),
                                                      .Y(edt_scan_in[169]));
   buf02 tessent_persistent_cell_edt_scan_in_170_buf (.A(edt_scan_in_buf_in[170]),
                                                      .Y(edt_scan_in[170]));
   buf02 tessent_persistent_cell_edt_scan_in_171_buf (.A(edt_scan_in_buf_in[171]),
                                                      .Y(edt_scan_in[171]));
   buf02 tessent_persistent_cell_edt_scan_in_172_buf (.A(edt_scan_in_buf_in[172]),
                                                      .Y(edt_scan_in[172]));
   buf02 tessent_persistent_cell_edt_scan_in_173_buf (.A(edt_scan_in_buf_in[173]),
                                                      .Y(edt_scan_in[173]));
   buf02 tessent_persistent_cell_edt_scan_in_174_buf (.A(edt_scan_in_buf_in[174]),
                                                      .Y(edt_scan_in[174]));
   buf02 tessent_persistent_cell_edt_scan_in_175_buf (.A(edt_scan_in_buf_in[175]),
                                                      .Y(edt_scan_in[175]));
   buf02 tessent_persistent_cell_edt_scan_in_176_buf (.A(edt_scan_in_buf_in[176]),
                                                      .Y(edt_scan_in[176]));
   buf02 tessent_persistent_cell_edt_scan_in_177_buf (.A(edt_scan_in_buf_in[177]),
                                                      .Y(edt_scan_in[177]));
   buf02 tessent_persistent_cell_edt_scan_in_178_buf (.A(edt_scan_in_buf_in[178]),
                                                      .Y(edt_scan_in[178]));
   buf02 tessent_persistent_cell_edt_scan_in_179_buf (.A(edt_scan_in_buf_in[179]),
                                                      .Y(edt_scan_in[179]));
   buf02 tessent_persistent_cell_edt_scan_in_180_buf (.A(edt_scan_in_buf_in[180]),
                                                      .Y(edt_scan_in[180]));
   buf02 tessent_persistent_cell_edt_scan_in_181_buf (.A(edt_scan_in_buf_in[181]),
                                                      .Y(edt_scan_in[181]));
   buf02 tessent_persistent_cell_edt_scan_in_182_buf (.A(edt_scan_in_buf_in[182]),
                                                      .Y(edt_scan_in[182]));
   buf02 tessent_persistent_cell_edt_scan_in_183_buf (.A(edt_scan_in_buf_in[183]),
                                                      .Y(edt_scan_in[183]));
   buf02 tessent_persistent_cell_edt_scan_in_184_buf (.A(edt_scan_in_buf_in[184]),
                                                      .Y(edt_scan_in[184]));
   buf02 tessent_persistent_cell_edt_scan_in_185_buf (.A(edt_scan_in_buf_in[185]),
                                                      .Y(edt_scan_in[185]));
   buf02 tessent_persistent_cell_edt_scan_in_186_buf (.A(edt_scan_in_buf_in[186]),
                                                      .Y(edt_scan_in[186]));
   buf02 tessent_persistent_cell_edt_scan_in_187_buf (.A(edt_scan_in_buf_in[187]),
                                                      .Y(edt_scan_in[187]));
   buf02 tessent_persistent_cell_edt_scan_in_188_buf (.A(edt_scan_in_buf_in[188]),
                                                      .Y(edt_scan_in[188]));
   buf02 tessent_persistent_cell_edt_scan_in_189_buf (.A(edt_scan_in_buf_in[189]),
                                                      .Y(edt_scan_in[189]));
   buf02 tessent_persistent_cell_edt_scan_in_190_buf (.A(edt_scan_in_buf_in[190]),
                                                      .Y(edt_scan_in[190]));
   buf02 tessent_persistent_cell_edt_scan_in_191_buf (.A(edt_scan_in_buf_in[191]),
                                                      .Y(edt_scan_in[191]));
   buf02 tessent_persistent_cell_edt_scan_in_192_buf (.A(edt_scan_in_buf_in[192]),
                                                      .Y(edt_scan_in[192]));
   buf02 tessent_persistent_cell_edt_scan_in_193_buf (.A(edt_scan_in_buf_in[193]),
                                                      .Y(edt_scan_in[193]));
   buf02 tessent_persistent_cell_edt_scan_in_194_buf (.A(edt_scan_in_buf_in[194]),
                                                      .Y(edt_scan_in[194]));
   buf02 tessent_persistent_cell_edt_scan_in_195_buf (.A(edt_scan_in_buf_in[195]),
                                                      .Y(edt_scan_in[195]));
   buf02 tessent_persistent_cell_edt_scan_in_196_buf (.A(edt_scan_in_buf_in[196]),
                                                      .Y(edt_scan_in[196]));
   buf02 tessent_persistent_cell_edt_scan_in_197_buf (.A(edt_scan_in_buf_in[197]),
                                                      .Y(edt_scan_in[197]));
   buf02 tessent_persistent_cell_edt_scan_in_198_buf (.A(edt_scan_in_buf_in[198]),
                                                      .Y(edt_scan_in[198]));
   buf02 tessent_persistent_cell_edt_scan_in_199_buf (.A(edt_scan_in_buf_in[199]),
                                                      .Y(edt_scan_in[199]));
   buf02 tessent_persistent_cell_edt_scan_in_200_buf (.A(edt_scan_in_buf_in[200]),
                                                      .Y(edt_scan_in[200]));
   buf02 tessent_persistent_cell_edt_scan_in_201_buf (.A(edt_scan_in_buf_in[201]),
                                                      .Y(edt_scan_in[201]));
   buf02 tessent_persistent_cell_edt_scan_in_202_buf (.A(edt_scan_in_buf_in[202]),
                                                      .Y(edt_scan_in[202]));
   buf02 tessent_persistent_cell_edt_scan_in_203_buf (.A(edt_scan_in_buf_in[203]),
                                                      .Y(edt_scan_in[203]));
   buf02 tessent_persistent_cell_edt_scan_in_204_buf (.A(edt_scan_in_buf_in[204]),
                                                      .Y(edt_scan_in[204]));
   buf02 tessent_persistent_cell_edt_scan_in_205_buf (.A(edt_scan_in_buf_in[205]),
                                                      .Y(edt_scan_in[205]));
   buf02 tessent_persistent_cell_edt_scan_in_206_buf (.A(edt_scan_in_buf_in[206]),
                                                      .Y(edt_scan_in[206]));
   buf02 tessent_persistent_cell_edt_scan_in_207_buf (.A(edt_scan_in_buf_in[207]),
                                                      .Y(edt_scan_in[207]));
   buf02 tessent_persistent_cell_edt_scan_in_208_buf (.A(edt_scan_in_buf_in[208]),
                                                      .Y(edt_scan_in[208]));
   buf02 tessent_persistent_cell_edt_scan_in_209_buf (.A(edt_scan_in_buf_in[209]),
                                                      .Y(edt_scan_in[209]));
   buf02 tessent_persistent_cell_edt_scan_in_210_buf (.A(edt_scan_in_buf_in[210]),
                                                      .Y(edt_scan_in[210]));
   buf02 tessent_persistent_cell_edt_scan_in_211_buf (.A(edt_scan_in_buf_in[211]),
                                                      .Y(edt_scan_in[211]));
   buf02 tessent_persistent_cell_edt_scan_in_212_buf (.A(edt_scan_in_buf_in[212]),
                                                      .Y(edt_scan_in[212]));
   buf02 tessent_persistent_cell_edt_scan_in_213_buf (.A(edt_scan_in_buf_in[213]),
                                                      .Y(edt_scan_in[213]));
   buf02 tessent_persistent_cell_edt_scan_in_214_buf (.A(edt_scan_in_buf_in[214]),
                                                      .Y(edt_scan_in[214]));
   buf02 tessent_persistent_cell_edt_scan_in_215_buf (.A(edt_scan_in_buf_in[215]),
                                                      .Y(edt_scan_in[215]));
   buf02 tessent_persistent_cell_edt_scan_in_216_buf (.A(edt_scan_in_buf_in[216]),
                                                      .Y(edt_scan_in[216]));
   buf02 tessent_persistent_cell_edt_scan_in_217_buf (.A(edt_scan_in_buf_in[217]),
                                                      .Y(edt_scan_in[217]));
   buf02 tessent_persistent_cell_edt_scan_in_218_buf (.A(edt_scan_in_buf_in[218]),
                                                      .Y(edt_scan_in[218]));
   buf02 tessent_persistent_cell_edt_scan_in_219_buf (.A(edt_scan_in_buf_in[219]),
                                                      .Y(edt_scan_in[219]));
   buf02 tessent_persistent_cell_edt_scan_in_220_buf (.A(edt_scan_in_buf_in[220]),
                                                      .Y(edt_scan_in[220]));
   buf02 tessent_persistent_cell_edt_scan_in_221_buf (.A(edt_scan_in_buf_in[221]),
                                                      .Y(edt_scan_in[221]));
   buf02 tessent_persistent_cell_edt_scan_in_222_buf (.A(edt_scan_in_buf_in[222]),
                                                      .Y(edt_scan_in[222]));
   buf02 tessent_persistent_cell_edt_scan_in_223_buf (.A(edt_scan_in_buf_in[223]),
                                                      .Y(edt_scan_in[223]));
   buf02 tessent_persistent_cell_edt_scan_in_224_buf (.A(edt_scan_in_buf_in[224]),
                                                      .Y(edt_scan_in[224]));
   buf02 tessent_persistent_cell_edt_scan_in_225_buf (.A(edt_scan_in_buf_in[225]),
                                                      .Y(edt_scan_in[225]));
   buf02 tessent_persistent_cell_edt_scan_in_226_buf (.A(edt_scan_in_buf_in[226]),
                                                      .Y(edt_scan_in[226]));
   buf02 tessent_persistent_cell_edt_scan_in_227_buf (.A(edt_scan_in_buf_in[227]),
                                                      .Y(edt_scan_in[227]));
   buf02 tessent_persistent_cell_edt_scan_in_228_buf (.A(edt_scan_in_buf_in[228]),
                                                      .Y(edt_scan_in[228]));
   buf02 tessent_persistent_cell_edt_scan_in_229_buf (.A(edt_scan_in_buf_in[229]),
                                                      .Y(edt_scan_in[229]));
   buf02 tessent_persistent_cell_edt_scan_in_230_buf (.A(edt_scan_in_buf_in[230]),
                                                      .Y(edt_scan_in[230]));
   buf02 tessent_persistent_cell_edt_scan_in_231_buf (.A(edt_scan_in_buf_in[231]),
                                                      .Y(edt_scan_in[231]));
   buf02 tessent_persistent_cell_edt_scan_in_232_buf (.A(edt_scan_in_buf_in[232]),
                                                      .Y(edt_scan_in[232]));
   buf02 tessent_persistent_cell_edt_scan_in_233_buf (.A(edt_scan_in_buf_in[233]),
                                                      .Y(edt_scan_in[233]));
   buf02 tessent_persistent_cell_edt_scan_in_234_buf (.A(edt_scan_in_buf_in[234]),
                                                      .Y(edt_scan_in[234]));
   buf02 tessent_persistent_cell_edt_scan_in_235_buf (.A(edt_scan_in_buf_in[235]),
                                                      .Y(edt_scan_in[235]));
   buf02 tessent_persistent_cell_edt_scan_in_236_buf (.A(edt_scan_in_buf_in[236]),
                                                      .Y(edt_scan_in[236]));
   buf02 tessent_persistent_cell_edt_scan_in_237_buf (.A(edt_scan_in_buf_in[237]),
                                                      .Y(edt_scan_in[237]));
   buf02 tessent_persistent_cell_edt_scan_in_238_buf (.A(edt_scan_in_buf_in[238]),
                                                      .Y(edt_scan_in[238]));
   buf02 tessent_persistent_cell_edt_scan_in_239_buf (.A(edt_scan_in_buf_in[239]),
                                                      .Y(edt_scan_in[239]));
   buf02 tessent_persistent_cell_edt_scan_in_240_buf (.A(edt_scan_in_buf_in[240]),
                                                      .Y(edt_scan_in[240]));
   buf02 tessent_persistent_cell_edt_scan_in_241_buf (.A(edt_scan_in_buf_in[241]),
                                                      .Y(edt_scan_in[241]));
   buf02 tessent_persistent_cell_edt_scan_in_242_buf (.A(edt_scan_in_buf_in[242]),
                                                      .Y(edt_scan_in[242]));
   buf02 tessent_persistent_cell_edt_scan_in_243_buf (.A(edt_scan_in_buf_in[243]),
                                                      .Y(edt_scan_in[243]));
   buf02 tessent_persistent_cell_edt_scan_in_244_buf (.A(edt_scan_in_buf_in[244]),
                                                      .Y(edt_scan_in[244]));
   buf02 tessent_persistent_cell_edt_scan_in_245_buf (.A(edt_scan_in_buf_in[245]),
                                                      .Y(edt_scan_in[245]));

   buf02 tessent_persistent_cell_edt_scan_out_0_buf (.A(edt_scan_out[0]),
                                                     .Y(edt_scan_out_buf_out[0]));
   buf02 tessent_persistent_cell_edt_scan_out_1_buf (.A(edt_scan_out[1]),
                                                     .Y(edt_scan_out_buf_out[1]));
   buf02 tessent_persistent_cell_edt_scan_out_2_buf (.A(edt_scan_out[2]),
                                                     .Y(edt_scan_out_buf_out[2]));
   buf02 tessent_persistent_cell_edt_scan_out_3_buf (.A(edt_scan_out[3]),
                                                     .Y(edt_scan_out_buf_out[3]));
   buf02 tessent_persistent_cell_edt_scan_out_4_buf (.A(edt_scan_out[4]),
                                                     .Y(edt_scan_out_buf_out[4]));
   buf02 tessent_persistent_cell_edt_scan_out_5_buf (.A(edt_scan_out[5]),
                                                     .Y(edt_scan_out_buf_out[5]));
   buf02 tessent_persistent_cell_edt_scan_out_6_buf (.A(edt_scan_out[6]),
                                                     .Y(edt_scan_out_buf_out[6]));
   buf02 tessent_persistent_cell_edt_scan_out_7_buf (.A(edt_scan_out[7]),
                                                     .Y(edt_scan_out_buf_out[7]));
   buf02 tessent_persistent_cell_edt_scan_out_8_buf (.A(edt_scan_out[8]),
                                                     .Y(edt_scan_out_buf_out[8]));
   buf02 tessent_persistent_cell_edt_scan_out_9_buf (.A(edt_scan_out[9]),
                                                     .Y(edt_scan_out_buf_out[9]));
   buf02 tessent_persistent_cell_edt_scan_out_10_buf (.A(edt_scan_out[10]),
                                                      .Y(edt_scan_out_buf_out[10]));
   buf02 tessent_persistent_cell_edt_scan_out_11_buf (.A(edt_scan_out[11]),
                                                      .Y(edt_scan_out_buf_out[11]));
   buf02 tessent_persistent_cell_edt_scan_out_12_buf (.A(edt_scan_out[12]),
                                                      .Y(edt_scan_out_buf_out[12]));
   buf02 tessent_persistent_cell_edt_scan_out_13_buf (.A(edt_scan_out[13]),
                                                      .Y(edt_scan_out_buf_out[13]));
   buf02 tessent_persistent_cell_edt_scan_out_14_buf (.A(edt_scan_out[14]),
                                                      .Y(edt_scan_out_buf_out[14]));
   buf02 tessent_persistent_cell_edt_scan_out_15_buf (.A(edt_scan_out[15]),
                                                      .Y(edt_scan_out_buf_out[15]));
   buf02 tessent_persistent_cell_edt_scan_out_16_buf (.A(edt_scan_out[16]),
                                                      .Y(edt_scan_out_buf_out[16]));
   buf02 tessent_persistent_cell_edt_scan_out_17_buf (.A(edt_scan_out[17]),
                                                      .Y(edt_scan_out_buf_out[17]));
   buf02 tessent_persistent_cell_edt_scan_out_18_buf (.A(edt_scan_out[18]),
                                                      .Y(edt_scan_out_buf_out[18]));
   buf02 tessent_persistent_cell_edt_scan_out_19_buf (.A(edt_scan_out[19]),
                                                      .Y(edt_scan_out_buf_out[19]));
   buf02 tessent_persistent_cell_edt_scan_out_20_buf (.A(edt_scan_out[20]),
                                                      .Y(edt_scan_out_buf_out[20]));
   buf02 tessent_persistent_cell_edt_scan_out_21_buf (.A(edt_scan_out[21]),
                                                      .Y(edt_scan_out_buf_out[21]));
   buf02 tessent_persistent_cell_edt_scan_out_22_buf (.A(edt_scan_out[22]),
                                                      .Y(edt_scan_out_buf_out[22]));
   buf02 tessent_persistent_cell_edt_scan_out_23_buf (.A(edt_scan_out[23]),
                                                      .Y(edt_scan_out_buf_out[23]));
   buf02 tessent_persistent_cell_edt_scan_out_24_buf (.A(edt_scan_out[24]),
                                                      .Y(edt_scan_out_buf_out[24]));
   buf02 tessent_persistent_cell_edt_scan_out_25_buf (.A(edt_scan_out[25]),
                                                      .Y(edt_scan_out_buf_out[25]));
   buf02 tessent_persistent_cell_edt_scan_out_26_buf (.A(edt_scan_out[26]),
                                                      .Y(edt_scan_out_buf_out[26]));
   buf02 tessent_persistent_cell_edt_scan_out_27_buf (.A(edt_scan_out[27]),
                                                      .Y(edt_scan_out_buf_out[27]));
   buf02 tessent_persistent_cell_edt_scan_out_28_buf (.A(edt_scan_out[28]),
                                                      .Y(edt_scan_out_buf_out[28]));
   buf02 tessent_persistent_cell_edt_scan_out_29_buf (.A(edt_scan_out[29]),
                                                      .Y(edt_scan_out_buf_out[29]));
   buf02 tessent_persistent_cell_edt_scan_out_30_buf (.A(edt_scan_out[30]),
                                                      .Y(edt_scan_out_buf_out[30]));
   buf02 tessent_persistent_cell_edt_scan_out_31_buf (.A(edt_scan_out[31]),
                                                      .Y(edt_scan_out_buf_out[31]));
   buf02 tessent_persistent_cell_edt_scan_out_32_buf (.A(edt_scan_out[32]),
                                                      .Y(edt_scan_out_buf_out[32]));
   buf02 tessent_persistent_cell_edt_scan_out_33_buf (.A(edt_scan_out[33]),
                                                      .Y(edt_scan_out_buf_out[33]));
   buf02 tessent_persistent_cell_edt_scan_out_34_buf (.A(edt_scan_out[34]),
                                                      .Y(edt_scan_out_buf_out[34]));
   buf02 tessent_persistent_cell_edt_scan_out_35_buf (.A(edt_scan_out[35]),
                                                      .Y(edt_scan_out_buf_out[35]));
   buf02 tessent_persistent_cell_edt_scan_out_36_buf (.A(edt_scan_out[36]),
                                                      .Y(edt_scan_out_buf_out[36]));
   buf02 tessent_persistent_cell_edt_scan_out_37_buf (.A(edt_scan_out[37]),
                                                      .Y(edt_scan_out_buf_out[37]));
   buf02 tessent_persistent_cell_edt_scan_out_38_buf (.A(edt_scan_out[38]),
                                                      .Y(edt_scan_out_buf_out[38]));
   buf02 tessent_persistent_cell_edt_scan_out_39_buf (.A(edt_scan_out[39]),
                                                      .Y(edt_scan_out_buf_out[39]));
   buf02 tessent_persistent_cell_edt_scan_out_40_buf (.A(edt_scan_out[40]),
                                                      .Y(edt_scan_out_buf_out[40]));
   buf02 tessent_persistent_cell_edt_scan_out_41_buf (.A(edt_scan_out[41]),
                                                      .Y(edt_scan_out_buf_out[41]));
   buf02 tessent_persistent_cell_edt_scan_out_42_buf (.A(edt_scan_out[42]),
                                                      .Y(edt_scan_out_buf_out[42]));
   buf02 tessent_persistent_cell_edt_scan_out_43_buf (.A(edt_scan_out[43]),
                                                      .Y(edt_scan_out_buf_out[43]));
   buf02 tessent_persistent_cell_edt_scan_out_44_buf (.A(edt_scan_out[44]),
                                                      .Y(edt_scan_out_buf_out[44]));
   buf02 tessent_persistent_cell_edt_scan_out_45_buf (.A(edt_scan_out[45]),
                                                      .Y(edt_scan_out_buf_out[45]));
   buf02 tessent_persistent_cell_edt_scan_out_46_buf (.A(edt_scan_out[46]),
                                                      .Y(edt_scan_out_buf_out[46]));
   buf02 tessent_persistent_cell_edt_scan_out_47_buf (.A(edt_scan_out[47]),
                                                      .Y(edt_scan_out_buf_out[47]));
   buf02 tessent_persistent_cell_edt_scan_out_48_buf (.A(edt_scan_out[48]),
                                                      .Y(edt_scan_out_buf_out[48]));
   buf02 tessent_persistent_cell_edt_scan_out_49_buf (.A(edt_scan_out[49]),
                                                      .Y(edt_scan_out_buf_out[49]));
   buf02 tessent_persistent_cell_edt_scan_out_50_buf (.A(edt_scan_out[50]),
                                                      .Y(edt_scan_out_buf_out[50]));
   buf02 tessent_persistent_cell_edt_scan_out_51_buf (.A(edt_scan_out[51]),
                                                      .Y(edt_scan_out_buf_out[51]));
   buf02 tessent_persistent_cell_edt_scan_out_52_buf (.A(edt_scan_out[52]),
                                                      .Y(edt_scan_out_buf_out[52]));
   buf02 tessent_persistent_cell_edt_scan_out_53_buf (.A(edt_scan_out[53]),
                                                      .Y(edt_scan_out_buf_out[53]));
   buf02 tessent_persistent_cell_edt_scan_out_54_buf (.A(edt_scan_out[54]),
                                                      .Y(edt_scan_out_buf_out[54]));
   buf02 tessent_persistent_cell_edt_scan_out_55_buf (.A(edt_scan_out[55]),
                                                      .Y(edt_scan_out_buf_out[55]));
   buf02 tessent_persistent_cell_edt_scan_out_56_buf (.A(edt_scan_out[56]),
                                                      .Y(edt_scan_out_buf_out[56]));
   buf02 tessent_persistent_cell_edt_scan_out_57_buf (.A(edt_scan_out[57]),
                                                      .Y(edt_scan_out_buf_out[57]));
   buf02 tessent_persistent_cell_edt_scan_out_58_buf (.A(edt_scan_out[58]),
                                                      .Y(edt_scan_out_buf_out[58]));
   buf02 tessent_persistent_cell_edt_scan_out_59_buf (.A(edt_scan_out[59]),
                                                      .Y(edt_scan_out_buf_out[59]));
   buf02 tessent_persistent_cell_edt_scan_out_60_buf (.A(edt_scan_out[60]),
                                                      .Y(edt_scan_out_buf_out[60]));
   buf02 tessent_persistent_cell_edt_scan_out_61_buf (.A(edt_scan_out[61]),
                                                      .Y(edt_scan_out_buf_out[61]));
   buf02 tessent_persistent_cell_edt_scan_out_62_buf (.A(edt_scan_out[62]),
                                                      .Y(edt_scan_out_buf_out[62]));
   buf02 tessent_persistent_cell_edt_scan_out_63_buf (.A(edt_scan_out[63]),
                                                      .Y(edt_scan_out_buf_out[63]));
   buf02 tessent_persistent_cell_edt_scan_out_64_buf (.A(edt_scan_out[64]),
                                                      .Y(edt_scan_out_buf_out[64]));
   buf02 tessent_persistent_cell_edt_scan_out_65_buf (.A(edt_scan_out[65]),
                                                      .Y(edt_scan_out_buf_out[65]));
   buf02 tessent_persistent_cell_edt_scan_out_66_buf (.A(edt_scan_out[66]),
                                                      .Y(edt_scan_out_buf_out[66]));
   buf02 tessent_persistent_cell_edt_scan_out_67_buf (.A(edt_scan_out[67]),
                                                      .Y(edt_scan_out_buf_out[67]));
   buf02 tessent_persistent_cell_edt_scan_out_68_buf (.A(edt_scan_out[68]),
                                                      .Y(edt_scan_out_buf_out[68]));
   buf02 tessent_persistent_cell_edt_scan_out_69_buf (.A(edt_scan_out[69]),
                                                      .Y(edt_scan_out_buf_out[69]));
   buf02 tessent_persistent_cell_edt_scan_out_70_buf (.A(edt_scan_out[70]),
                                                      .Y(edt_scan_out_buf_out[70]));
   buf02 tessent_persistent_cell_edt_scan_out_71_buf (.A(edt_scan_out[71]),
                                                      .Y(edt_scan_out_buf_out[71]));
   buf02 tessent_persistent_cell_edt_scan_out_72_buf (.A(edt_scan_out[72]),
                                                      .Y(edt_scan_out_buf_out[72]));
   buf02 tessent_persistent_cell_edt_scan_out_73_buf (.A(edt_scan_out[73]),
                                                      .Y(edt_scan_out_buf_out[73]));
   buf02 tessent_persistent_cell_edt_scan_out_74_buf (.A(edt_scan_out[74]),
                                                      .Y(edt_scan_out_buf_out[74]));
   buf02 tessent_persistent_cell_edt_scan_out_75_buf (.A(edt_scan_out[75]),
                                                      .Y(edt_scan_out_buf_out[75]));
   buf02 tessent_persistent_cell_edt_scan_out_76_buf (.A(edt_scan_out[76]),
                                                      .Y(edt_scan_out_buf_out[76]));
   buf02 tessent_persistent_cell_edt_scan_out_77_buf (.A(edt_scan_out[77]),
                                                      .Y(edt_scan_out_buf_out[77]));
   buf02 tessent_persistent_cell_edt_scan_out_78_buf (.A(edt_scan_out[78]),
                                                      .Y(edt_scan_out_buf_out[78]));
   buf02 tessent_persistent_cell_edt_scan_out_79_buf (.A(edt_scan_out[79]),
                                                      .Y(edt_scan_out_buf_out[79]));
   buf02 tessent_persistent_cell_edt_scan_out_80_buf (.A(edt_scan_out[80]),
                                                      .Y(edt_scan_out_buf_out[80]));
   buf02 tessent_persistent_cell_edt_scan_out_81_buf (.A(edt_scan_out[81]),
                                                      .Y(edt_scan_out_buf_out[81]));
   buf02 tessent_persistent_cell_edt_scan_out_82_buf (.A(edt_scan_out[82]),
                                                      .Y(edt_scan_out_buf_out[82]));
   buf02 tessent_persistent_cell_edt_scan_out_83_buf (.A(edt_scan_out[83]),
                                                      .Y(edt_scan_out_buf_out[83]));
   buf02 tessent_persistent_cell_edt_scan_out_84_buf (.A(edt_scan_out[84]),
                                                      .Y(edt_scan_out_buf_out[84]));
   buf02 tessent_persistent_cell_edt_scan_out_85_buf (.A(edt_scan_out[85]),
                                                      .Y(edt_scan_out_buf_out[85]));
   buf02 tessent_persistent_cell_edt_scan_out_86_buf (.A(edt_scan_out[86]),
                                                      .Y(edt_scan_out_buf_out[86]));
   buf02 tessent_persistent_cell_edt_scan_out_87_buf (.A(edt_scan_out[87]),
                                                      .Y(edt_scan_out_buf_out[87]));
   buf02 tessent_persistent_cell_edt_scan_out_88_buf (.A(edt_scan_out[88]),
                                                      .Y(edt_scan_out_buf_out[88]));
   buf02 tessent_persistent_cell_edt_scan_out_89_buf (.A(edt_scan_out[89]),
                                                      .Y(edt_scan_out_buf_out[89]));
   buf02 tessent_persistent_cell_edt_scan_out_90_buf (.A(edt_scan_out[90]),
                                                      .Y(edt_scan_out_buf_out[90]));
   buf02 tessent_persistent_cell_edt_scan_out_91_buf (.A(edt_scan_out[91]),
                                                      .Y(edt_scan_out_buf_out[91]));
   buf02 tessent_persistent_cell_edt_scan_out_92_buf (.A(edt_scan_out[92]),
                                                      .Y(edt_scan_out_buf_out[92]));
   buf02 tessent_persistent_cell_edt_scan_out_93_buf (.A(edt_scan_out[93]),
                                                      .Y(edt_scan_out_buf_out[93]));
   buf02 tessent_persistent_cell_edt_scan_out_94_buf (.A(edt_scan_out[94]),
                                                      .Y(edt_scan_out_buf_out[94]));
   buf02 tessent_persistent_cell_edt_scan_out_95_buf (.A(edt_scan_out[95]),
                                                      .Y(edt_scan_out_buf_out[95]));
   buf02 tessent_persistent_cell_edt_scan_out_96_buf (.A(edt_scan_out[96]),
                                                      .Y(edt_scan_out_buf_out[96]));
   buf02 tessent_persistent_cell_edt_scan_out_97_buf (.A(edt_scan_out[97]),
                                                      .Y(edt_scan_out_buf_out[97]));
   buf02 tessent_persistent_cell_edt_scan_out_98_buf (.A(edt_scan_out[98]),
                                                      .Y(edt_scan_out_buf_out[98]));
   buf02 tessent_persistent_cell_edt_scan_out_99_buf (.A(edt_scan_out[99]),
                                                      .Y(edt_scan_out_buf_out[99]));
   buf02 tessent_persistent_cell_edt_scan_out_100_buf (.A(edt_scan_out[100]),
                                                       .Y(edt_scan_out_buf_out[100]));
   buf02 tessent_persistent_cell_edt_scan_out_101_buf (.A(edt_scan_out[101]),
                                                       .Y(edt_scan_out_buf_out[101]));
   buf02 tessent_persistent_cell_edt_scan_out_102_buf (.A(edt_scan_out[102]),
                                                       .Y(edt_scan_out_buf_out[102]));
   buf02 tessent_persistent_cell_edt_scan_out_103_buf (.A(edt_scan_out[103]),
                                                       .Y(edt_scan_out_buf_out[103]));
   buf02 tessent_persistent_cell_edt_scan_out_104_buf (.A(edt_scan_out[104]),
                                                       .Y(edt_scan_out_buf_out[104]));
   buf02 tessent_persistent_cell_edt_scan_out_105_buf (.A(edt_scan_out[105]),
                                                       .Y(edt_scan_out_buf_out[105]));
   buf02 tessent_persistent_cell_edt_scan_out_106_buf (.A(edt_scan_out[106]),
                                                       .Y(edt_scan_out_buf_out[106]));
   buf02 tessent_persistent_cell_edt_scan_out_107_buf (.A(edt_scan_out[107]),
                                                       .Y(edt_scan_out_buf_out[107]));
   buf02 tessent_persistent_cell_edt_scan_out_108_buf (.A(edt_scan_out[108]),
                                                       .Y(edt_scan_out_buf_out[108]));
   buf02 tessent_persistent_cell_edt_scan_out_109_buf (.A(edt_scan_out[109]),
                                                       .Y(edt_scan_out_buf_out[109]));
   buf02 tessent_persistent_cell_edt_scan_out_110_buf (.A(edt_scan_out[110]),
                                                       .Y(edt_scan_out_buf_out[110]));
   buf02 tessent_persistent_cell_edt_scan_out_111_buf (.A(edt_scan_out[111]),
                                                       .Y(edt_scan_out_buf_out[111]));
   buf02 tessent_persistent_cell_edt_scan_out_112_buf (.A(edt_scan_out[112]),
                                                       .Y(edt_scan_out_buf_out[112]));
   buf02 tessent_persistent_cell_edt_scan_out_113_buf (.A(edt_scan_out[113]),
                                                       .Y(edt_scan_out_buf_out[113]));
   buf02 tessent_persistent_cell_edt_scan_out_114_buf (.A(edt_scan_out[114]),
                                                       .Y(edt_scan_out_buf_out[114]));
   buf02 tessent_persistent_cell_edt_scan_out_115_buf (.A(edt_scan_out[115]),
                                                       .Y(edt_scan_out_buf_out[115]));
   buf02 tessent_persistent_cell_edt_scan_out_116_buf (.A(edt_scan_out[116]),
                                                       .Y(edt_scan_out_buf_out[116]));
   buf02 tessent_persistent_cell_edt_scan_out_117_buf (.A(edt_scan_out[117]),
                                                       .Y(edt_scan_out_buf_out[117]));
   buf02 tessent_persistent_cell_edt_scan_out_118_buf (.A(edt_scan_out[118]),
                                                       .Y(edt_scan_out_buf_out[118]));
   buf02 tessent_persistent_cell_edt_scan_out_119_buf (.A(edt_scan_out[119]),
                                                       .Y(edt_scan_out_buf_out[119]));
   buf02 tessent_persistent_cell_edt_scan_out_120_buf (.A(edt_scan_out[120]),
                                                       .Y(edt_scan_out_buf_out[120]));
   buf02 tessent_persistent_cell_edt_scan_out_121_buf (.A(edt_scan_out[121]),
                                                       .Y(edt_scan_out_buf_out[121]));
   buf02 tessent_persistent_cell_edt_scan_out_122_buf (.A(edt_scan_out[122]),
                                                       .Y(edt_scan_out_buf_out[122]));
   buf02 tessent_persistent_cell_edt_scan_out_123_buf (.A(edt_scan_out[123]),
                                                       .Y(edt_scan_out_buf_out[123]));
   buf02 tessent_persistent_cell_edt_scan_out_124_buf (.A(edt_scan_out[124]),
                                                       .Y(edt_scan_out_buf_out[124]));
   buf02 tessent_persistent_cell_edt_scan_out_125_buf (.A(edt_scan_out[125]),
                                                       .Y(edt_scan_out_buf_out[125]));
   buf02 tessent_persistent_cell_edt_scan_out_126_buf (.A(edt_scan_out[126]),
                                                       .Y(edt_scan_out_buf_out[126]));
   buf02 tessent_persistent_cell_edt_scan_out_127_buf (.A(edt_scan_out[127]),
                                                       .Y(edt_scan_out_buf_out[127]));
   buf02 tessent_persistent_cell_edt_scan_out_128_buf (.A(edt_scan_out[128]),
                                                       .Y(edt_scan_out_buf_out[128]));
   buf02 tessent_persistent_cell_edt_scan_out_129_buf (.A(edt_scan_out[129]),
                                                       .Y(edt_scan_out_buf_out[129]));
   buf02 tessent_persistent_cell_edt_scan_out_130_buf (.A(edt_scan_out[130]),
                                                       .Y(edt_scan_out_buf_out[130]));
   buf02 tessent_persistent_cell_edt_scan_out_131_buf (.A(edt_scan_out[131]),
                                                       .Y(edt_scan_out_buf_out[131]));
   buf02 tessent_persistent_cell_edt_scan_out_132_buf (.A(edt_scan_out[132]),
                                                       .Y(edt_scan_out_buf_out[132]));
   buf02 tessent_persistent_cell_edt_scan_out_133_buf (.A(edt_scan_out[133]),
                                                       .Y(edt_scan_out_buf_out[133]));
   buf02 tessent_persistent_cell_edt_scan_out_134_buf (.A(edt_scan_out[134]),
                                                       .Y(edt_scan_out_buf_out[134]));
   buf02 tessent_persistent_cell_edt_scan_out_135_buf (.A(edt_scan_out[135]),
                                                       .Y(edt_scan_out_buf_out[135]));
   buf02 tessent_persistent_cell_edt_scan_out_136_buf (.A(edt_scan_out[136]),
                                                       .Y(edt_scan_out_buf_out[136]));
   buf02 tessent_persistent_cell_edt_scan_out_137_buf (.A(edt_scan_out[137]),
                                                       .Y(edt_scan_out_buf_out[137]));
   buf02 tessent_persistent_cell_edt_scan_out_138_buf (.A(edt_scan_out[138]),
                                                       .Y(edt_scan_out_buf_out[138]));
   buf02 tessent_persistent_cell_edt_scan_out_139_buf (.A(edt_scan_out[139]),
                                                       .Y(edt_scan_out_buf_out[139]));
   buf02 tessent_persistent_cell_edt_scan_out_140_buf (.A(edt_scan_out[140]),
                                                       .Y(edt_scan_out_buf_out[140]));
   buf02 tessent_persistent_cell_edt_scan_out_141_buf (.A(edt_scan_out[141]),
                                                       .Y(edt_scan_out_buf_out[141]));
   buf02 tessent_persistent_cell_edt_scan_out_142_buf (.A(edt_scan_out[142]),
                                                       .Y(edt_scan_out_buf_out[142]));
   buf02 tessent_persistent_cell_edt_scan_out_143_buf (.A(edt_scan_out[143]),
                                                       .Y(edt_scan_out_buf_out[143]));
   buf02 tessent_persistent_cell_edt_scan_out_144_buf (.A(edt_scan_out[144]),
                                                       .Y(edt_scan_out_buf_out[144]));
   buf02 tessent_persistent_cell_edt_scan_out_145_buf (.A(edt_scan_out[145]),
                                                       .Y(edt_scan_out_buf_out[145]));
   buf02 tessent_persistent_cell_edt_scan_out_146_buf (.A(edt_scan_out[146]),
                                                       .Y(edt_scan_out_buf_out[146]));
   buf02 tessent_persistent_cell_edt_scan_out_147_buf (.A(edt_scan_out[147]),
                                                       .Y(edt_scan_out_buf_out[147]));
   buf02 tessent_persistent_cell_edt_scan_out_148_buf (.A(edt_scan_out[148]),
                                                       .Y(edt_scan_out_buf_out[148]));
   buf02 tessent_persistent_cell_edt_scan_out_149_buf (.A(edt_scan_out[149]),
                                                       .Y(edt_scan_out_buf_out[149]));
   buf02 tessent_persistent_cell_edt_scan_out_150_buf (.A(edt_scan_out[150]),
                                                       .Y(edt_scan_out_buf_out[150]));
   buf02 tessent_persistent_cell_edt_scan_out_151_buf (.A(edt_scan_out[151]),
                                                       .Y(edt_scan_out_buf_out[151]));
   buf02 tessent_persistent_cell_edt_scan_out_152_buf (.A(edt_scan_out[152]),
                                                       .Y(edt_scan_out_buf_out[152]));
   buf02 tessent_persistent_cell_edt_scan_out_153_buf (.A(edt_scan_out[153]),
                                                       .Y(edt_scan_out_buf_out[153]));
   buf02 tessent_persistent_cell_edt_scan_out_154_buf (.A(edt_scan_out[154]),
                                                       .Y(edt_scan_out_buf_out[154]));
   buf02 tessent_persistent_cell_edt_scan_out_155_buf (.A(edt_scan_out[155]),
                                                       .Y(edt_scan_out_buf_out[155]));
   buf02 tessent_persistent_cell_edt_scan_out_156_buf (.A(edt_scan_out[156]),
                                                       .Y(edt_scan_out_buf_out[156]));
   buf02 tessent_persistent_cell_edt_scan_out_157_buf (.A(edt_scan_out[157]),
                                                       .Y(edt_scan_out_buf_out[157]));
   buf02 tessent_persistent_cell_edt_scan_out_158_buf (.A(edt_scan_out[158]),
                                                       .Y(edt_scan_out_buf_out[158]));
   buf02 tessent_persistent_cell_edt_scan_out_159_buf (.A(edt_scan_out[159]),
                                                       .Y(edt_scan_out_buf_out[159]));
   buf02 tessent_persistent_cell_edt_scan_out_160_buf (.A(edt_scan_out[160]),
                                                       .Y(edt_scan_out_buf_out[160]));
   buf02 tessent_persistent_cell_edt_scan_out_161_buf (.A(edt_scan_out[161]),
                                                       .Y(edt_scan_out_buf_out[161]));
   buf02 tessent_persistent_cell_edt_scan_out_162_buf (.A(edt_scan_out[162]),
                                                       .Y(edt_scan_out_buf_out[162]));
   buf02 tessent_persistent_cell_edt_scan_out_163_buf (.A(edt_scan_out[163]),
                                                       .Y(edt_scan_out_buf_out[163]));
   buf02 tessent_persistent_cell_edt_scan_out_164_buf (.A(edt_scan_out[164]),
                                                       .Y(edt_scan_out_buf_out[164]));
   buf02 tessent_persistent_cell_edt_scan_out_165_buf (.A(edt_scan_out[165]),
                                                       .Y(edt_scan_out_buf_out[165]));
   buf02 tessent_persistent_cell_edt_scan_out_166_buf (.A(edt_scan_out[166]),
                                                       .Y(edt_scan_out_buf_out[166]));
   buf02 tessent_persistent_cell_edt_scan_out_167_buf (.A(edt_scan_out[167]),
                                                       .Y(edt_scan_out_buf_out[167]));
   buf02 tessent_persistent_cell_edt_scan_out_168_buf (.A(edt_scan_out[168]),
                                                       .Y(edt_scan_out_buf_out[168]));
   buf02 tessent_persistent_cell_edt_scan_out_169_buf (.A(edt_scan_out[169]),
                                                       .Y(edt_scan_out_buf_out[169]));
   buf02 tessent_persistent_cell_edt_scan_out_170_buf (.A(edt_scan_out[170]),
                                                       .Y(edt_scan_out_buf_out[170]));
   buf02 tessent_persistent_cell_edt_scan_out_171_buf (.A(edt_scan_out[171]),
                                                       .Y(edt_scan_out_buf_out[171]));
   buf02 tessent_persistent_cell_edt_scan_out_172_buf (.A(edt_scan_out[172]),
                                                       .Y(edt_scan_out_buf_out[172]));
   buf02 tessent_persistent_cell_edt_scan_out_173_buf (.A(edt_scan_out[173]),
                                                       .Y(edt_scan_out_buf_out[173]));
   buf02 tessent_persistent_cell_edt_scan_out_174_buf (.A(edt_scan_out[174]),
                                                       .Y(edt_scan_out_buf_out[174]));
   buf02 tessent_persistent_cell_edt_scan_out_175_buf (.A(edt_scan_out[175]),
                                                       .Y(edt_scan_out_buf_out[175]));
   buf02 tessent_persistent_cell_edt_scan_out_176_buf (.A(edt_scan_out[176]),
                                                       .Y(edt_scan_out_buf_out[176]));
   buf02 tessent_persistent_cell_edt_scan_out_177_buf (.A(edt_scan_out[177]),
                                                       .Y(edt_scan_out_buf_out[177]));
   buf02 tessent_persistent_cell_edt_scan_out_178_buf (.A(edt_scan_out[178]),
                                                       .Y(edt_scan_out_buf_out[178]));
   buf02 tessent_persistent_cell_edt_scan_out_179_buf (.A(edt_scan_out[179]),
                                                       .Y(edt_scan_out_buf_out[179]));
   buf02 tessent_persistent_cell_edt_scan_out_180_buf (.A(edt_scan_out[180]),
                                                       .Y(edt_scan_out_buf_out[180]));
   buf02 tessent_persistent_cell_edt_scan_out_181_buf (.A(edt_scan_out[181]),
                                                       .Y(edt_scan_out_buf_out[181]));
   buf02 tessent_persistent_cell_edt_scan_out_182_buf (.A(edt_scan_out[182]),
                                                       .Y(edt_scan_out_buf_out[182]));
   buf02 tessent_persistent_cell_edt_scan_out_183_buf (.A(edt_scan_out[183]),
                                                       .Y(edt_scan_out_buf_out[183]));
   buf02 tessent_persistent_cell_edt_scan_out_184_buf (.A(edt_scan_out[184]),
                                                       .Y(edt_scan_out_buf_out[184]));
   buf02 tessent_persistent_cell_edt_scan_out_185_buf (.A(edt_scan_out[185]),
                                                       .Y(edt_scan_out_buf_out[185]));
   buf02 tessent_persistent_cell_edt_scan_out_186_buf (.A(edt_scan_out[186]),
                                                       .Y(edt_scan_out_buf_out[186]));
   buf02 tessent_persistent_cell_edt_scan_out_187_buf (.A(edt_scan_out[187]),
                                                       .Y(edt_scan_out_buf_out[187]));
   buf02 tessent_persistent_cell_edt_scan_out_188_buf (.A(edt_scan_out[188]),
                                                       .Y(edt_scan_out_buf_out[188]));
   buf02 tessent_persistent_cell_edt_scan_out_189_buf (.A(edt_scan_out[189]),
                                                       .Y(edt_scan_out_buf_out[189]));
   buf02 tessent_persistent_cell_edt_scan_out_190_buf (.A(edt_scan_out[190]),
                                                       .Y(edt_scan_out_buf_out[190]));
   buf02 tessent_persistent_cell_edt_scan_out_191_buf (.A(edt_scan_out[191]),
                                                       .Y(edt_scan_out_buf_out[191]));
   buf02 tessent_persistent_cell_edt_scan_out_192_buf (.A(edt_scan_out[192]),
                                                       .Y(edt_scan_out_buf_out[192]));
   buf02 tessent_persistent_cell_edt_scan_out_193_buf (.A(edt_scan_out[193]),
                                                       .Y(edt_scan_out_buf_out[193]));
   buf02 tessent_persistent_cell_edt_scan_out_194_buf (.A(edt_scan_out[194]),
                                                       .Y(edt_scan_out_buf_out[194]));
   buf02 tessent_persistent_cell_edt_scan_out_195_buf (.A(edt_scan_out[195]),
                                                       .Y(edt_scan_out_buf_out[195]));
   buf02 tessent_persistent_cell_edt_scan_out_196_buf (.A(edt_scan_out[196]),
                                                       .Y(edt_scan_out_buf_out[196]));
   buf02 tessent_persistent_cell_edt_scan_out_197_buf (.A(edt_scan_out[197]),
                                                       .Y(edt_scan_out_buf_out[197]));
   buf02 tessent_persistent_cell_edt_scan_out_198_buf (.A(edt_scan_out[198]),
                                                       .Y(edt_scan_out_buf_out[198]));
   buf02 tessent_persistent_cell_edt_scan_out_199_buf (.A(edt_scan_out[199]),
                                                       .Y(edt_scan_out_buf_out[199]));
   buf02 tessent_persistent_cell_edt_scan_out_200_buf (.A(edt_scan_out[200]),
                                                       .Y(edt_scan_out_buf_out[200]));
   buf02 tessent_persistent_cell_edt_scan_out_201_buf (.A(edt_scan_out[201]),
                                                       .Y(edt_scan_out_buf_out[201]));
   buf02 tessent_persistent_cell_edt_scan_out_202_buf (.A(edt_scan_out[202]),
                                                       .Y(edt_scan_out_buf_out[202]));
   buf02 tessent_persistent_cell_edt_scan_out_203_buf (.A(edt_scan_out[203]),
                                                       .Y(edt_scan_out_buf_out[203]));
   buf02 tessent_persistent_cell_edt_scan_out_204_buf (.A(edt_scan_out[204]),
                                                       .Y(edt_scan_out_buf_out[204]));
   buf02 tessent_persistent_cell_edt_scan_out_205_buf (.A(edt_scan_out[205]),
                                                       .Y(edt_scan_out_buf_out[205]));
   buf02 tessent_persistent_cell_edt_scan_out_206_buf (.A(edt_scan_out[206]),
                                                       .Y(edt_scan_out_buf_out[206]));
   buf02 tessent_persistent_cell_edt_scan_out_207_buf (.A(edt_scan_out[207]),
                                                       .Y(edt_scan_out_buf_out[207]));
   buf02 tessent_persistent_cell_edt_scan_out_208_buf (.A(edt_scan_out[208]),
                                                       .Y(edt_scan_out_buf_out[208]));
   buf02 tessent_persistent_cell_edt_scan_out_209_buf (.A(edt_scan_out[209]),
                                                       .Y(edt_scan_out_buf_out[209]));
   buf02 tessent_persistent_cell_edt_scan_out_210_buf (.A(edt_scan_out[210]),
                                                       .Y(edt_scan_out_buf_out[210]));
   buf02 tessent_persistent_cell_edt_scan_out_211_buf (.A(edt_scan_out[211]),
                                                       .Y(edt_scan_out_buf_out[211]));
   buf02 tessent_persistent_cell_edt_scan_out_212_buf (.A(edt_scan_out[212]),
                                                       .Y(edt_scan_out_buf_out[212]));
   buf02 tessent_persistent_cell_edt_scan_out_213_buf (.A(edt_scan_out[213]),
                                                       .Y(edt_scan_out_buf_out[213]));
   buf02 tessent_persistent_cell_edt_scan_out_214_buf (.A(edt_scan_out[214]),
                                                       .Y(edt_scan_out_buf_out[214]));
   buf02 tessent_persistent_cell_edt_scan_out_215_buf (.A(edt_scan_out[215]),
                                                       .Y(edt_scan_out_buf_out[215]));
   buf02 tessent_persistent_cell_edt_scan_out_216_buf (.A(edt_scan_out[216]),
                                                       .Y(edt_scan_out_buf_out[216]));
   buf02 tessent_persistent_cell_edt_scan_out_217_buf (.A(edt_scan_out[217]),
                                                       .Y(edt_scan_out_buf_out[217]));
   buf02 tessent_persistent_cell_edt_scan_out_218_buf (.A(edt_scan_out[218]),
                                                       .Y(edt_scan_out_buf_out[218]));
   buf02 tessent_persistent_cell_edt_scan_out_219_buf (.A(edt_scan_out[219]),
                                                       .Y(edt_scan_out_buf_out[219]));
   buf02 tessent_persistent_cell_edt_scan_out_220_buf (.A(edt_scan_out[220]),
                                                       .Y(edt_scan_out_buf_out[220]));
   buf02 tessent_persistent_cell_edt_scan_out_221_buf (.A(edt_scan_out[221]),
                                                       .Y(edt_scan_out_buf_out[221]));
   buf02 tessent_persistent_cell_edt_scan_out_222_buf (.A(edt_scan_out[222]),
                                                       .Y(edt_scan_out_buf_out[222]));
   buf02 tessent_persistent_cell_edt_scan_out_223_buf (.A(edt_scan_out[223]),
                                                       .Y(edt_scan_out_buf_out[223]));
   buf02 tessent_persistent_cell_edt_scan_out_224_buf (.A(edt_scan_out[224]),
                                                       .Y(edt_scan_out_buf_out[224]));
   buf02 tessent_persistent_cell_edt_scan_out_225_buf (.A(edt_scan_out[225]),
                                                       .Y(edt_scan_out_buf_out[225]));
   buf02 tessent_persistent_cell_edt_scan_out_226_buf (.A(edt_scan_out[226]),
                                                       .Y(edt_scan_out_buf_out[226]));
   buf02 tessent_persistent_cell_edt_scan_out_227_buf (.A(edt_scan_out[227]),
                                                       .Y(edt_scan_out_buf_out[227]));
   buf02 tessent_persistent_cell_edt_scan_out_228_buf (.A(edt_scan_out[228]),
                                                       .Y(edt_scan_out_buf_out[228]));
   buf02 tessent_persistent_cell_edt_scan_out_229_buf (.A(edt_scan_out[229]),
                                                       .Y(edt_scan_out_buf_out[229]));
   buf02 tessent_persistent_cell_edt_scan_out_230_buf (.A(edt_scan_out[230]),
                                                       .Y(edt_scan_out_buf_out[230]));
   buf02 tessent_persistent_cell_edt_scan_out_231_buf (.A(edt_scan_out[231]),
                                                       .Y(edt_scan_out_buf_out[231]));
   buf02 tessent_persistent_cell_edt_scan_out_232_buf (.A(edt_scan_out[232]),
                                                       .Y(edt_scan_out_buf_out[232]));
   buf02 tessent_persistent_cell_edt_scan_out_233_buf (.A(edt_scan_out[233]),
                                                       .Y(edt_scan_out_buf_out[233]));
   buf02 tessent_persistent_cell_edt_scan_out_234_buf (.A(edt_scan_out[234]),
                                                       .Y(edt_scan_out_buf_out[234]));
   buf02 tessent_persistent_cell_edt_scan_out_235_buf (.A(edt_scan_out[235]),
                                                       .Y(edt_scan_out_buf_out[235]));
   buf02 tessent_persistent_cell_edt_scan_out_236_buf (.A(edt_scan_out[236]),
                                                       .Y(edt_scan_out_buf_out[236]));
   buf02 tessent_persistent_cell_edt_scan_out_237_buf (.A(edt_scan_out[237]),
                                                       .Y(edt_scan_out_buf_out[237]));
   buf02 tessent_persistent_cell_edt_scan_out_238_buf (.A(edt_scan_out[238]),
                                                       .Y(edt_scan_out_buf_out[238]));
   buf02 tessent_persistent_cell_edt_scan_out_239_buf (.A(edt_scan_out[239]),
                                                       .Y(edt_scan_out_buf_out[239]));
   buf02 tessent_persistent_cell_edt_scan_out_240_buf (.A(edt_scan_out[240]),
                                                       .Y(edt_scan_out_buf_out[240]));
   buf02 tessent_persistent_cell_edt_scan_out_241_buf (.A(edt_scan_out[241]),
                                                       .Y(edt_scan_out_buf_out[241]));
   buf02 tessent_persistent_cell_edt_scan_out_242_buf (.A(edt_scan_out[242]),
                                                       .Y(edt_scan_out_buf_out[242]));
   buf02 tessent_persistent_cell_edt_scan_out_243_buf (.A(edt_scan_out[243]),
                                                       .Y(edt_scan_out_buf_out[243]));
   buf02 tessent_persistent_cell_edt_scan_out_244_buf (.A(edt_scan_out[244]),
                                                       .Y(edt_scan_out_buf_out[244]));
   buf02 tessent_persistent_cell_edt_scan_out_245_buf (.A(edt_scan_out[245]),
                                                       .Y(edt_scan_out_buf_out[245]));

   processor_core_logic_test_tessent_edt_EXT_EDT_decompressor processor_core_logic_test_tessent_edt_EXT_EDT_decompressor_i (
      .edt_clock(edt_clock_buf_out),
      .edt_update(edt_update_buf_out),
      .scan_en(scan_en_buf_out),
      .edt_channels_in(edt_channels_out_from_controller),
      .edt_scan_in(edt_decompressor_out));

   processor_core_logic_test_tessent_edt_EXT_EDT_compactor processor_core_logic_test_tessent_edt_EXT_EDT_compactor_i (
      .edt_clock(edt_clock_buf_out),
      .edt_scan_out(edt_scan_out_buf_out),
      .masks_for_compactor_0(masks_for_compactor_0),
      .masks_for_compactor_1(masks_for_compactor_1),
      .edt_channels_out(edt_bypass_out));

   processor_core_logic_test_tessent_edt_EXT_EDT_controller processor_core_logic_test_tessent_edt_EXT_EDT_controller_i (
      .edt_clock(edt_clock_buf_out),
      .edt_update(edt_update_buf_out),
      .edt_low_power_shift_en(edt_low_power_shift_en_buf_out),
      .edt_channels_in(edt_channels_in_buf_out),
      .edt_decompressor_out(edt_decompressor_out),
      .edt_channels_out_from_controller(edt_channels_out_from_controller),
      .masks_for_compactor_0(masks_for_compactor_0),
      .masks_for_compactor_1(masks_for_compactor_1),
      .edt_scan_in(edt_bypass_in));

   processor_core_logic_test_tessent_edt_EXT_EDT_bypass_logic processor_core_logic_test_tessent_edt_EXT_EDT_bypass_logic_i (
      .edt_bypass(edt_bypass_buf_out),
      .edt_channels_in(edt_channels_in_buf_out),
      .edt_channels_out(edt_channels_out_buf_in),
      .edt_scan_in(edt_scan_in_buf_in),
      .edt_scan_out(edt_scan_out_buf_out),
      .edt_bypass_in(edt_bypass_in),
      .edt_bypass_out(edt_bypass_out));
endmodule



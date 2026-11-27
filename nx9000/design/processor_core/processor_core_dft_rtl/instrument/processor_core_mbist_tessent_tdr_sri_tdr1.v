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

module processor_core_mbist_tessent_tdr_sri_tdr1 (
  input wire ijtag_reset,
  input wire ijtag_sel,
  input wire ijtag_si,
  input wire ijtag_ce,
  input wire ijtag_se,
  input wire ijtag_ue,
  input wire ijtag_tck,
  output wire [46:0] ijtag_data_out,
  output wire ijtag_so
);
reg    [46:0]       tdr;
reg                 retiming_so ;
reg                 ijtag_data_out_46_latch;
reg                 ijtag_data_out_45_latch;
reg                 ijtag_data_out_44_latch;
reg                 ijtag_data_out_43_latch;
reg                 ijtag_data_out_42_latch;
reg                 ijtag_data_out_41_latch;
reg                 ijtag_data_out_40_latch;
reg                 ijtag_data_out_39_latch;
reg                 ijtag_data_out_38_latch;
reg                 ijtag_data_out_37_latch;
reg                 ijtag_data_out_36_latch;
reg                 ijtag_data_out_35_latch;
reg                 ijtag_data_out_34_latch;
reg                 ijtag_data_out_33_latch;
reg                 ijtag_data_out_32_latch;
reg                 ijtag_data_out_31_latch;
reg                 ijtag_data_out_30_latch;
reg                 ijtag_data_out_29_latch;
reg                 ijtag_data_out_28_latch;
reg                 ijtag_data_out_27_latch;
reg                 ijtag_data_out_26_latch;
reg                 ijtag_data_out_25_latch;
reg                 ijtag_data_out_24_latch;
reg                 ijtag_data_out_23_latch;
reg                 ijtag_data_out_22_latch;
reg                 ijtag_data_out_21_latch;
reg                 ijtag_data_out_20_latch;
reg                 ijtag_data_out_19_latch;
reg                 ijtag_data_out_18_latch;
reg                 ijtag_data_out_17_latch;
reg                 ijtag_data_out_16_latch;
reg                 ijtag_data_out_15_latch;
reg                 ijtag_data_out_14_latch;
reg                 ijtag_data_out_13_latch;
reg                 ijtag_data_out_12_latch;
reg                 ijtag_data_out_11_latch;
reg                 ijtag_data_out_10_latch;
reg                 ijtag_data_out_9_latch;
reg                 ijtag_data_out_8_latch;
reg                 ijtag_data_out_7_latch;
reg                 ijtag_data_out_6_latch;
reg                 ijtag_data_out_5_latch;
reg                 ijtag_data_out_4_latch;
reg                 ijtag_data_out_3_latch;
reg                 ijtag_data_out_2_latch;
reg                 ijtag_data_out_1_latch;
reg                 ijtag_data_out_0_latch;
 
 
assign ijtag_data_out[46]               = ijtag_data_out_46_latch;
assign ijtag_data_out[45]               = ijtag_data_out_45_latch;
assign ijtag_data_out[44]               = ijtag_data_out_44_latch;
assign ijtag_data_out[43]               = ijtag_data_out_43_latch;
assign ijtag_data_out[42]               = ijtag_data_out_42_latch;
assign ijtag_data_out[41]               = ijtag_data_out_41_latch;
assign ijtag_data_out[40]               = ijtag_data_out_40_latch;
assign ijtag_data_out[39]               = ijtag_data_out_39_latch;
assign ijtag_data_out[38]               = ijtag_data_out_38_latch;
assign ijtag_data_out[37]               = ijtag_data_out_37_latch;
assign ijtag_data_out[36]               = ijtag_data_out_36_latch;
assign ijtag_data_out[35]               = ijtag_data_out_35_latch;
assign ijtag_data_out[34]               = ijtag_data_out_34_latch;
assign ijtag_data_out[33]               = ijtag_data_out_33_latch;
assign ijtag_data_out[32]               = ijtag_data_out_32_latch;
assign ijtag_data_out[31]               = ijtag_data_out_31_latch;
assign ijtag_data_out[30]               = ijtag_data_out_30_latch;
assign ijtag_data_out[29]               = ijtag_data_out_29_latch;
assign ijtag_data_out[28]               = ijtag_data_out_28_latch;
assign ijtag_data_out[27]               = ijtag_data_out_27_latch;
assign ijtag_data_out[26]               = ijtag_data_out_26_latch;
assign ijtag_data_out[25]               = ijtag_data_out_25_latch;
assign ijtag_data_out[24]               = ijtag_data_out_24_latch;
assign ijtag_data_out[23]               = ijtag_data_out_23_latch;
assign ijtag_data_out[22]               = ijtag_data_out_22_latch;
assign ijtag_data_out[21]               = ijtag_data_out_21_latch;
assign ijtag_data_out[20]               = ijtag_data_out_20_latch;
assign ijtag_data_out[19]               = ijtag_data_out_19_latch;
assign ijtag_data_out[18]               = ijtag_data_out_18_latch;
assign ijtag_data_out[17]               = ijtag_data_out_17_latch;
assign ijtag_data_out[16]               = ijtag_data_out_16_latch;
assign ijtag_data_out[15]               = ijtag_data_out_15_latch;
assign ijtag_data_out[14]               = ijtag_data_out_14_latch;
assign ijtag_data_out[13]               = ijtag_data_out_13_latch;
assign ijtag_data_out[12]               = ijtag_data_out_12_latch;
assign ijtag_data_out[11]               = ijtag_data_out_11_latch;
assign ijtag_data_out[10]               = ijtag_data_out_10_latch;
assign ijtag_data_out[9]                = ijtag_data_out_9_latch;
assign ijtag_data_out[8]                = ijtag_data_out_8_latch;
assign ijtag_data_out[7]                = ijtag_data_out_7_latch;
assign ijtag_data_out[6]                = ijtag_data_out_6_latch;
assign ijtag_data_out[5]                = ijtag_data_out_5_latch;
assign ijtag_data_out[4]                = ijtag_data_out_4_latch;
assign ijtag_data_out[3]                = ijtag_data_out_3_latch;
assign ijtag_data_out[2]                = ijtag_data_out_2_latch;
assign ijtag_data_out[1]                = ijtag_data_out_1_latch;
assign ijtag_data_out[0]                = ijtag_data_out_0_latch;
 
// --------- ShiftRegister ---------
 
always @ (posedge ijtag_tck) begin
  if (ijtag_ce & ijtag_sel) begin
    tdr <= { 47'b00000000000000000000000000000000000000000000000};
  end else if (ijtag_se & ijtag_sel) begin
    tdr <= {ijtag_si,tdr[46:1]};
  end
end
 
assign ijtag_so = retiming_so;
always @ (negedge ijtag_tck) begin
  retiming_so <= tdr[0];
end
 
// --------- DataOutPort 46 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_46_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_46_latch <= tdr[46];
    end
  end
end
 
// --------- DataOutPort 45 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_45_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_45_latch <= tdr[45];
    end
  end
end
 
// --------- DataOutPort 44 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_44_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_44_latch <= tdr[44];
    end
  end
end
 
// --------- DataOutPort 43 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_43_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_43_latch <= tdr[43];
    end
  end
end
 
// --------- DataOutPort 42 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_42_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_42_latch <= tdr[42];
    end
  end
end
 
// --------- DataOutPort 41 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_41_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_41_latch <= tdr[41];
    end
  end
end
 
// --------- DataOutPort 40 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_40_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_40_latch <= tdr[40];
    end
  end
end
 
// --------- DataOutPort 39 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_39_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_39_latch <= tdr[39];
    end
  end
end
 
// --------- DataOutPort 38 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_38_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_38_latch <= tdr[38];
    end
  end
end
 
// --------- DataOutPort 37 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_37_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_37_latch <= tdr[37];
    end
  end
end
 
// --------- DataOutPort 36 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_36_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_36_latch <= tdr[36];
    end
  end
end
 
// --------- DataOutPort 35 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_35_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_35_latch <= tdr[35];
    end
  end
end
 
// --------- DataOutPort 34 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_34_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_34_latch <= tdr[34];
    end
  end
end
 
// --------- DataOutPort 33 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_33_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_33_latch <= tdr[33];
    end
  end
end
 
// --------- DataOutPort 32 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_32_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_32_latch <= tdr[32];
    end
  end
end
 
// --------- DataOutPort 31 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_31_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_31_latch <= tdr[31];
    end
  end
end
 
// --------- DataOutPort 30 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_30_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_30_latch <= tdr[30];
    end
  end
end
 
// --------- DataOutPort 29 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_29_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_29_latch <= tdr[29];
    end
  end
end
 
// --------- DataOutPort 28 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_28_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_28_latch <= tdr[28];
    end
  end
end
 
// --------- DataOutPort 27 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_27_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_27_latch <= tdr[27];
    end
  end
end
 
// --------- DataOutPort 26 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_26_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_26_latch <= tdr[26];
    end
  end
end
 
// --------- DataOutPort 25 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_25_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_25_latch <= tdr[25];
    end
  end
end
 
// --------- DataOutPort 24 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_24_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_24_latch <= tdr[24];
    end
  end
end
 
// --------- DataOutPort 23 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_23_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_23_latch <= tdr[23];
    end
  end
end
 
// --------- DataOutPort 22 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_22_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_22_latch <= tdr[22];
    end
  end
end
 
// --------- DataOutPort 21 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_21_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_21_latch <= tdr[21];
    end
  end
end
 
// --------- DataOutPort 20 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_20_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_20_latch <= tdr[20];
    end
  end
end
 
// --------- DataOutPort 19 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_19_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_19_latch <= tdr[19];
    end
  end
end
 
// --------- DataOutPort 18 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_18_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_18_latch <= tdr[18];
    end
  end
end
 
// --------- DataOutPort 17 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_17_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_17_latch <= tdr[17];
    end
  end
end
 
// --------- DataOutPort 16 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_16_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_16_latch <= tdr[16];
    end
  end
end
 
// --------- DataOutPort 15 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_15_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_15_latch <= tdr[15];
    end
  end
end
 
// --------- DataOutPort 14 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_14_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_14_latch <= tdr[14];
    end
  end
end
 
// --------- DataOutPort 13 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_13_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_13_latch <= tdr[13];
    end
  end
end
 
// --------- DataOutPort 12 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_12_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_12_latch <= tdr[12];
    end
  end
end
 
// --------- DataOutPort 11 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_11_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_11_latch <= tdr[11];
    end
  end
end
 
// --------- DataOutPort 10 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_10_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_10_latch <= tdr[10];
    end
  end
end
 
// --------- DataOutPort 9 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_9_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_9_latch <= tdr[9];
    end
  end
end
 
// --------- DataOutPort 8 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_8_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_8_latch <= tdr[8];
    end
  end
end
 
// --------- DataOutPort 7 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_7_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_7_latch <= tdr[7];
    end
  end
end
 
// --------- DataOutPort 6 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_6_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_6_latch <= tdr[6];
    end
  end
end
 
// --------- DataOutPort 5 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_5_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_5_latch <= tdr[5];
    end
  end
end
 
// --------- DataOutPort 4 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_4_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_4_latch <= tdr[4];
    end
  end
end
 
// --------- DataOutPort 3 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_3_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_3_latch <= tdr[3];
    end
  end
end
 
// --------- DataOutPort 2 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_2_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_2_latch <= tdr[2];
    end
  end
end
 
// --------- DataOutPort 1 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_1_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_1_latch <= tdr[1];
    end
  end
end
 
// --------- DataOutPort 0 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ijtag_data_out_0_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ijtag_data_out_0_latch <= tdr[0];
    end
  end
end
 
endmodule

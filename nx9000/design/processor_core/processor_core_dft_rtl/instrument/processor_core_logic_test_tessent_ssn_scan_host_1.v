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
//       Created on: Wed Jul 22 11:09:38 CST 2026
//--------------------------------------------------------------------------

module processor_core_logic_test_tessent_ssn_scan_host_1 (
  // Stream bus signals
  input wire             bus_clock,
  input wire  [1:0]      bus_data_in,
  output wire [1:0]      bus_data_out,
 
  // IJTAG signals
  input wire             ijtag_reset,
  input wire             ijtag_tck,
  input wire             ijtag_sel,
  input wire             ijtag_ce,
  input wire             ijtag_se,
  input wire             ijtag_ue,
  input wire             ijtag_si,
  output wire            ijtag_so,
  // Scan host interface
  output wire            scan_en,
  output wire            edt_update,
  output wire            test_clock,
  output wire [32:0]     to_scan_in,
  input wire  [32:0]     from_scan_out 
);
   
// Wire declarations
wire                  enable;
wire                  scan_en_from_fsm;
wire                  edt_update_from_fsm;
wire                  ext_capture_mode;
wire                  init_scan_load_used;
wire                  disable_first_scan_load_masking;
wire [30:0]           initial_offset;
wire                  sentinel_present;
wire                  relative_initial_offset_enable;
wire [1:0]            bus_width;
wire [5:0]            bits_per_packet;
wire [5:0]            to_scan_in_bits;
wire [5:0]            from_scan_out_bits;
wire [32:0]           from_scan_out_en_per_bit;
wire [27:0]           total_shift_cnt_minus_one;
wire [27:0]           extra_shift_packets;
wire [15:0]           packet_size;
wire [2:0]            timeslot_sharing_count_minus_one, timeslot_sharing_offset;
wire                  force_suppress_capture;
wire [1:0]            initial_bit0_position;
wire [2:0]            capture_packets;
wire [2:0]            packets_per_capture_clock_minus_one;
wire                  enable_sync;
wire                  start_of_packet;
wire [1:0]            in_bit0_position_in_first_bus_word;
wire [5:0]            in_bits_in_remaining_bus_words;
wire [6:0]            received_in_bit_cnt;
wire                  last_in_bits_in_current_bus_word;
wire                  ready_to_shift;
wire                  ready_to_capture;
wire                  edt_clock_en_from_fsm;
wire                  pulse_width_packet_cnt_is_zero;
wire                  shift_clock_en;
wire                  select_capture_clock_low_width;
wire                  capture_clock_en;
wire [6:0]            scan_en_transition_packets;
wire [6:0]            scan_en_launch_packet;
wire                  scan_en_launch_packet_equal_transition_packets;
wire [6:0]            edt_update_falling_transition_words;
wire [6:0]            edt_update_falling_launch_word;
wire [5:0]            min_shift_clock_low_width;
wire                  min_shift_clock_low_width_is_zero;
wire [5:0]            min_capture_clock_low_width;
wire                  min_capture_clock_low_width_is_zero;
wire                  packet_width_is_less_than_two_bus_clock;
wire                  infinite_shift_mode;
wire                  last_scan_load_is_done;
wire                  use_div_shift_clocks;
wire                  to_scan_in0_d;
wire [1:0]            drive_bus_out_gated;
wire                  drive_bus_out_disable;
wire [31:0]           in_bit_storage_en;
wire [1:0]            next_to_scan_word_bits_in_bus;
wire [1:0]            start_of_next_to_scan_word_in_bus;
wire                  have_in_bits_in_remaining_bus_words;
wire                  the_next_to_scan_word_starts_in_bus;
wire                  loop_back_en;
wire                  bus_register_ijtag_access_en;
wire                  ssn_bus_data_in1_muxed_with_ijtag_si;
wire                  tck_enable;
wire                  tck_clock_gated;
wire                  ssn_bus_clock_muxed_with_tck;
wire                  streaming_through_ijtag_en;
wire                  ssn_bus_data_in0_muxed_with_ijtag_si;
wire                  inject_tck_as_capture_clock;
// EDT host interface
wire                  scan_en_int;
wire [32:0]           to_scan_in_int;
wire [32:0]           from_scan_out_int;
wire [32:0]           from_scan_out_selected;
wire                  enable_buf;
wire                  scan_en_gated;
wire                  enable_sync_reset;
wire                  bus_sync_reset_pulse;
wire                  bus_enable_sync_reset;
 
assign bus_enable_sync_reset = ~ijtag_reset;
 
wire                  bus_clock_int;
wire [1:0]            bus_data_in_int;
wire [1:0]            bus_data_out_int;
 
clock_buf02 tessent_persistent_cell_bus_clock_buf (
  .A                          ( bus_clock               ),
  .Y                          ( bus_clock_int           )
);
 
buf02 tessent_persistent_cell_bus_data_in_buf_1 (
  .A                          ( bus_data_in[1]          ),
  .Y                          ( bus_data_in_int[1]      )
);
buf02 tessent_persistent_cell_bus_data_in_buf_0 (
  .A                          ( bus_data_in[0]          ),
  .Y                          ( bus_data_in_int[0]      )
);
 
buf02 tessent_persistent_cell_bus_data_out_buf_1 (
  .A                          ( bus_data_out_int[1]     ),
  .Y                          ( bus_data_out[1]         )
);
buf02 tessent_persistent_cell_bus_data_out_buf_0 (
  .A                          ( bus_data_out_int[0]     ),
  .Y                          ( bus_data_out[0]         )
);
 
reg                            enable_sync_reset_ff;
 
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    enable_sync_reset_ff <= 1'b0;
  end else begin
    enable_sync_reset_ff <= ijtag_ue && ijtag_sel;
  end
end
 
assign enable_sync_reset = ~ijtag_reset | enable_sync_reset_ff;
 
buf02 tessent_persistent_cell_enable_buf (
  .A      ( enable                                      ),
  .Y      ( enable_buf                                  )
);
 
buf02 tessent_persistent_cell_scan_en_buf (
  .A      ( scan_en_gated                               ),
  .Y      ( scan_en                                     )
);
assign scan_en_gated = enable & scan_en_int;
 
buf02 tessent_persistent_cell_to_scan_in_0_buf (
  .A      ( to_scan_in_int[0]                           ),
  .Y      ( to_scan_in[0]                               )
);
buf02 tessent_persistent_cell_to_scan_in_1_buf (
  .A      ( to_scan_in_int[1]                           ),
  .Y      ( to_scan_in[1]                               )
);
buf02 tessent_persistent_cell_to_scan_in_2_buf (
  .A      ( to_scan_in_int[2]                           ),
  .Y      ( to_scan_in[2]                               )
);
buf02 tessent_persistent_cell_to_scan_in_3_buf (
  .A      ( to_scan_in_int[3]                           ),
  .Y      ( to_scan_in[3]                               )
);
buf02 tessent_persistent_cell_to_scan_in_4_buf (
  .A      ( to_scan_in_int[4]                           ),
  .Y      ( to_scan_in[4]                               )
);
buf02 tessent_persistent_cell_to_scan_in_5_buf (
  .A      ( to_scan_in_int[5]                           ),
  .Y      ( to_scan_in[5]                               )
);
buf02 tessent_persistent_cell_to_scan_in_6_buf (
  .A      ( to_scan_in_int[6]                           ),
  .Y      ( to_scan_in[6]                               )
);
buf02 tessent_persistent_cell_to_scan_in_7_buf (
  .A      ( to_scan_in_int[7]                           ),
  .Y      ( to_scan_in[7]                               )
);
buf02 tessent_persistent_cell_to_scan_in_8_buf (
  .A      ( to_scan_in_int[8]                           ),
  .Y      ( to_scan_in[8]                               )
);
buf02 tessent_persistent_cell_to_scan_in_9_buf (
  .A      ( to_scan_in_int[9]                           ),
  .Y      ( to_scan_in[9]                               )
);
buf02 tessent_persistent_cell_to_scan_in_10_buf (
  .A      ( to_scan_in_int[10]                          ),
  .Y      ( to_scan_in[10]                              )
);
buf02 tessent_persistent_cell_to_scan_in_11_buf (
  .A      ( to_scan_in_int[11]                          ),
  .Y      ( to_scan_in[11]                              )
);
buf02 tessent_persistent_cell_to_scan_in_12_buf (
  .A      ( to_scan_in_int[12]                          ),
  .Y      ( to_scan_in[12]                              )
);
buf02 tessent_persistent_cell_to_scan_in_13_buf (
  .A      ( to_scan_in_int[13]                          ),
  .Y      ( to_scan_in[13]                              )
);
buf02 tessent_persistent_cell_to_scan_in_14_buf (
  .A      ( to_scan_in_int[14]                          ),
  .Y      ( to_scan_in[14]                              )
);
buf02 tessent_persistent_cell_to_scan_in_15_buf (
  .A      ( to_scan_in_int[15]                          ),
  .Y      ( to_scan_in[15]                              )
);
buf02 tessent_persistent_cell_to_scan_in_16_buf (
  .A      ( to_scan_in_int[16]                          ),
  .Y      ( to_scan_in[16]                              )
);
buf02 tessent_persistent_cell_to_scan_in_17_buf (
  .A      ( to_scan_in_int[17]                          ),
  .Y      ( to_scan_in[17]                              )
);
buf02 tessent_persistent_cell_to_scan_in_18_buf (
  .A      ( to_scan_in_int[18]                          ),
  .Y      ( to_scan_in[18]                              )
);
buf02 tessent_persistent_cell_to_scan_in_19_buf (
  .A      ( to_scan_in_int[19]                          ),
  .Y      ( to_scan_in[19]                              )
);
buf02 tessent_persistent_cell_to_scan_in_20_buf (
  .A      ( to_scan_in_int[20]                          ),
  .Y      ( to_scan_in[20]                              )
);
buf02 tessent_persistent_cell_to_scan_in_21_buf (
  .A      ( to_scan_in_int[21]                          ),
  .Y      ( to_scan_in[21]                              )
);
buf02 tessent_persistent_cell_to_scan_in_22_buf (
  .A      ( to_scan_in_int[22]                          ),
  .Y      ( to_scan_in[22]                              )
);
buf02 tessent_persistent_cell_to_scan_in_23_buf (
  .A      ( to_scan_in_int[23]                          ),
  .Y      ( to_scan_in[23]                              )
);
buf02 tessent_persistent_cell_to_scan_in_24_buf (
  .A      ( to_scan_in_int[24]                          ),
  .Y      ( to_scan_in[24]                              )
);
buf02 tessent_persistent_cell_to_scan_in_25_buf (
  .A      ( to_scan_in_int[25]                          ),
  .Y      ( to_scan_in[25]                              )
);
buf02 tessent_persistent_cell_to_scan_in_26_buf (
  .A      ( to_scan_in_int[26]                          ),
  .Y      ( to_scan_in[26]                              )
);
buf02 tessent_persistent_cell_to_scan_in_27_buf (
  .A      ( to_scan_in_int[27]                          ),
  .Y      ( to_scan_in[27]                              )
);
buf02 tessent_persistent_cell_to_scan_in_28_buf (
  .A      ( to_scan_in_int[28]                          ),
  .Y      ( to_scan_in[28]                              )
);
buf02 tessent_persistent_cell_to_scan_in_29_buf (
  .A      ( to_scan_in_int[29]                          ),
  .Y      ( to_scan_in[29]                              )
);
buf02 tessent_persistent_cell_to_scan_in_30_buf (
  .A      ( to_scan_in_int[30]                          ),
  .Y      ( to_scan_in[30]                              )
);
buf02 tessent_persistent_cell_to_scan_in_31_buf (
  .A      ( to_scan_in_int[31]                          ),
  .Y      ( to_scan_in[31]                              )
);
buf02 tessent_persistent_cell_to_scan_in_32_buf (
  .A      ( to_scan_in_int[32]                          ),
  .Y      ( to_scan_in[32]                              )
);
   
assign from_scan_out_selected[0] = (loop_back_en && enable_sync) ? to_scan_in[0] : from_scan_out[0];
and02 tessent_persistent_cell_from_scan_out_0_and (
  .A0     ( from_scan_out_selected[0]                   ),
  .A1     ( from_scan_out_en_per_bit[0]                 ),
  .Y      ( from_scan_out_int[0]                        )
);
assign from_scan_out_selected[1] = (loop_back_en && enable_sync) ? to_scan_in[1] : from_scan_out[1];
and02 tessent_persistent_cell_from_scan_out_1_and (
  .A0     ( from_scan_out_selected[1]                   ),
  .A1     ( from_scan_out_en_per_bit[1]                 ),
  .Y      ( from_scan_out_int[1]                        )
);
assign from_scan_out_selected[2] = (loop_back_en && enable_sync) ? to_scan_in[2] : from_scan_out[2];
and02 tessent_persistent_cell_from_scan_out_2_and (
  .A0     ( from_scan_out_selected[2]                   ),
  .A1     ( from_scan_out_en_per_bit[2]                 ),
  .Y      ( from_scan_out_int[2]                        )
);
assign from_scan_out_selected[3] = (loop_back_en && enable_sync) ? to_scan_in[3] : from_scan_out[3];
and02 tessent_persistent_cell_from_scan_out_3_and (
  .A0     ( from_scan_out_selected[3]                   ),
  .A1     ( from_scan_out_en_per_bit[3]                 ),
  .Y      ( from_scan_out_int[3]                        )
);
assign from_scan_out_selected[4] = (loop_back_en && enable_sync) ? to_scan_in[4] : from_scan_out[4];
and02 tessent_persistent_cell_from_scan_out_4_and (
  .A0     ( from_scan_out_selected[4]                   ),
  .A1     ( from_scan_out_en_per_bit[4]                 ),
  .Y      ( from_scan_out_int[4]                        )
);
assign from_scan_out_selected[5] = (loop_back_en && enable_sync) ? to_scan_in[5] : from_scan_out[5];
and02 tessent_persistent_cell_from_scan_out_5_and (
  .A0     ( from_scan_out_selected[5]                   ),
  .A1     ( from_scan_out_en_per_bit[5]                 ),
  .Y      ( from_scan_out_int[5]                        )
);
assign from_scan_out_selected[6] = (loop_back_en && enable_sync) ? to_scan_in[6] : from_scan_out[6];
and02 tessent_persistent_cell_from_scan_out_6_and (
  .A0     ( from_scan_out_selected[6]                   ),
  .A1     ( from_scan_out_en_per_bit[6]                 ),
  .Y      ( from_scan_out_int[6]                        )
);
assign from_scan_out_selected[7] = (loop_back_en && enable_sync) ? to_scan_in[7] : from_scan_out[7];
and02 tessent_persistent_cell_from_scan_out_7_and (
  .A0     ( from_scan_out_selected[7]                   ),
  .A1     ( from_scan_out_en_per_bit[7]                 ),
  .Y      ( from_scan_out_int[7]                        )
);
assign from_scan_out_selected[8] = (loop_back_en && enable_sync) ? to_scan_in[8] : from_scan_out[8];
and02 tessent_persistent_cell_from_scan_out_8_and (
  .A0     ( from_scan_out_selected[8]                   ),
  .A1     ( from_scan_out_en_per_bit[8]                 ),
  .Y      ( from_scan_out_int[8]                        )
);
assign from_scan_out_selected[9] = (loop_back_en && enable_sync) ? to_scan_in[9] : from_scan_out[9];
and02 tessent_persistent_cell_from_scan_out_9_and (
  .A0     ( from_scan_out_selected[9]                   ),
  .A1     ( from_scan_out_en_per_bit[9]                 ),
  .Y      ( from_scan_out_int[9]                        )
);
assign from_scan_out_selected[10] = (loop_back_en && enable_sync) ? to_scan_in[10] : from_scan_out[10];
and02 tessent_persistent_cell_from_scan_out_10_and (
  .A0     ( from_scan_out_selected[10]                  ),
  .A1     ( from_scan_out_en_per_bit[10]                ),
  .Y      ( from_scan_out_int[10]                       )
);
assign from_scan_out_selected[11] = (loop_back_en && enable_sync) ? to_scan_in[11] : from_scan_out[11];
and02 tessent_persistent_cell_from_scan_out_11_and (
  .A0     ( from_scan_out_selected[11]                  ),
  .A1     ( from_scan_out_en_per_bit[11]                ),
  .Y      ( from_scan_out_int[11]                       )
);
assign from_scan_out_selected[12] = (loop_back_en && enable_sync) ? to_scan_in[12] : from_scan_out[12];
and02 tessent_persistent_cell_from_scan_out_12_and (
  .A0     ( from_scan_out_selected[12]                  ),
  .A1     ( from_scan_out_en_per_bit[12]                ),
  .Y      ( from_scan_out_int[12]                       )
);
assign from_scan_out_selected[13] = (loop_back_en && enable_sync) ? to_scan_in[13] : from_scan_out[13];
and02 tessent_persistent_cell_from_scan_out_13_and (
  .A0     ( from_scan_out_selected[13]                  ),
  .A1     ( from_scan_out_en_per_bit[13]                ),
  .Y      ( from_scan_out_int[13]                       )
);
assign from_scan_out_selected[14] = (loop_back_en && enable_sync) ? to_scan_in[14] : from_scan_out[14];
and02 tessent_persistent_cell_from_scan_out_14_and (
  .A0     ( from_scan_out_selected[14]                  ),
  .A1     ( from_scan_out_en_per_bit[14]                ),
  .Y      ( from_scan_out_int[14]                       )
);
assign from_scan_out_selected[15] = (loop_back_en && enable_sync) ? to_scan_in[15] : from_scan_out[15];
and02 tessent_persistent_cell_from_scan_out_15_and (
  .A0     ( from_scan_out_selected[15]                  ),
  .A1     ( from_scan_out_en_per_bit[15]                ),
  .Y      ( from_scan_out_int[15]                       )
);
assign from_scan_out_selected[16] = (loop_back_en && enable_sync) ? to_scan_in[16] : from_scan_out[16];
and02 tessent_persistent_cell_from_scan_out_16_and (
  .A0     ( from_scan_out_selected[16]                  ),
  .A1     ( from_scan_out_en_per_bit[16]                ),
  .Y      ( from_scan_out_int[16]                       )
);
assign from_scan_out_selected[17] = (loop_back_en && enable_sync) ? to_scan_in[17] : from_scan_out[17];
and02 tessent_persistent_cell_from_scan_out_17_and (
  .A0     ( from_scan_out_selected[17]                  ),
  .A1     ( from_scan_out_en_per_bit[17]                ),
  .Y      ( from_scan_out_int[17]                       )
);
assign from_scan_out_selected[18] = (loop_back_en && enable_sync) ? to_scan_in[18] : from_scan_out[18];
and02 tessent_persistent_cell_from_scan_out_18_and (
  .A0     ( from_scan_out_selected[18]                  ),
  .A1     ( from_scan_out_en_per_bit[18]                ),
  .Y      ( from_scan_out_int[18]                       )
);
assign from_scan_out_selected[19] = (loop_back_en && enable_sync) ? to_scan_in[19] : from_scan_out[19];
and02 tessent_persistent_cell_from_scan_out_19_and (
  .A0     ( from_scan_out_selected[19]                  ),
  .A1     ( from_scan_out_en_per_bit[19]                ),
  .Y      ( from_scan_out_int[19]                       )
);
assign from_scan_out_selected[20] = (loop_back_en && enable_sync) ? to_scan_in[20] : from_scan_out[20];
and02 tessent_persistent_cell_from_scan_out_20_and (
  .A0     ( from_scan_out_selected[20]                  ),
  .A1     ( from_scan_out_en_per_bit[20]                ),
  .Y      ( from_scan_out_int[20]                       )
);
assign from_scan_out_selected[21] = (loop_back_en && enable_sync) ? to_scan_in[21] : from_scan_out[21];
and02 tessent_persistent_cell_from_scan_out_21_and (
  .A0     ( from_scan_out_selected[21]                  ),
  .A1     ( from_scan_out_en_per_bit[21]                ),
  .Y      ( from_scan_out_int[21]                       )
);
assign from_scan_out_selected[22] = (loop_back_en && enable_sync) ? to_scan_in[22] : from_scan_out[22];
and02 tessent_persistent_cell_from_scan_out_22_and (
  .A0     ( from_scan_out_selected[22]                  ),
  .A1     ( from_scan_out_en_per_bit[22]                ),
  .Y      ( from_scan_out_int[22]                       )
);
assign from_scan_out_selected[23] = (loop_back_en && enable_sync) ? to_scan_in[23] : from_scan_out[23];
and02 tessent_persistent_cell_from_scan_out_23_and (
  .A0     ( from_scan_out_selected[23]                  ),
  .A1     ( from_scan_out_en_per_bit[23]                ),
  .Y      ( from_scan_out_int[23]                       )
);
assign from_scan_out_selected[24] = (loop_back_en && enable_sync) ? to_scan_in[24] : from_scan_out[24];
and02 tessent_persistent_cell_from_scan_out_24_and (
  .A0     ( from_scan_out_selected[24]                  ),
  .A1     ( from_scan_out_en_per_bit[24]                ),
  .Y      ( from_scan_out_int[24]                       )
);
assign from_scan_out_selected[25] = (loop_back_en && enable_sync) ? to_scan_in[25] : from_scan_out[25];
and02 tessent_persistent_cell_from_scan_out_25_and (
  .A0     ( from_scan_out_selected[25]                  ),
  .A1     ( from_scan_out_en_per_bit[25]                ),
  .Y      ( from_scan_out_int[25]                       )
);
assign from_scan_out_selected[26] = (loop_back_en && enable_sync) ? to_scan_in[26] : from_scan_out[26];
and02 tessent_persistent_cell_from_scan_out_26_and (
  .A0     ( from_scan_out_selected[26]                  ),
  .A1     ( from_scan_out_en_per_bit[26]                ),
  .Y      ( from_scan_out_int[26]                       )
);
assign from_scan_out_selected[27] = (loop_back_en && enable_sync) ? to_scan_in[27] : from_scan_out[27];
and02 tessent_persistent_cell_from_scan_out_27_and (
  .A0     ( from_scan_out_selected[27]                  ),
  .A1     ( from_scan_out_en_per_bit[27]                ),
  .Y      ( from_scan_out_int[27]                       )
);
assign from_scan_out_selected[28] = (loop_back_en && enable_sync) ? to_scan_in[28] : from_scan_out[28];
and02 tessent_persistent_cell_from_scan_out_28_and (
  .A0     ( from_scan_out_selected[28]                  ),
  .A1     ( from_scan_out_en_per_bit[28]                ),
  .Y      ( from_scan_out_int[28]                       )
);
assign from_scan_out_selected[29] = (loop_back_en && enable_sync) ? to_scan_in[29] : from_scan_out[29];
and02 tessent_persistent_cell_from_scan_out_29_and (
  .A0     ( from_scan_out_selected[29]                  ),
  .A1     ( from_scan_out_en_per_bit[29]                ),
  .Y      ( from_scan_out_int[29]                       )
);
assign from_scan_out_selected[30] = (loop_back_en && enable_sync) ? to_scan_in[30] : from_scan_out[30];
and02 tessent_persistent_cell_from_scan_out_30_and (
  .A0     ( from_scan_out_selected[30]                  ),
  .A1     ( from_scan_out_en_per_bit[30]                ),
  .Y      ( from_scan_out_int[30]                       )
);
assign from_scan_out_selected[31] = (loop_back_en && enable_sync) ? to_scan_in[31] : from_scan_out[31];
and02 tessent_persistent_cell_from_scan_out_31_and (
  .A0     ( from_scan_out_selected[31]                  ),
  .A1     ( from_scan_out_en_per_bit[31]                ),
  .Y      ( from_scan_out_int[31]                       )
);
assign from_scan_out_selected[32] = (loop_back_en && enable_sync) ? to_scan_in[32] : from_scan_out[32];
and02 tessent_persistent_cell_from_scan_out_32_and (
  .A0     ( from_scan_out_selected[32]                  ),
  .A1     ( from_scan_out_en_per_bit[32]                ),
  .Y      ( from_scan_out_int[32]                       )
);
 
assign tck_enable = streaming_through_ijtag_en || bus_register_ijtag_access_en;
    
cgand tessent_persistent_cell_tck_clock_gater (
  .GCK    ( tck_clock_gated                             ),
  .CK     ( ijtag_tck                                   ),
  .FE     ( ijtag_sel && ijtag_se && tck_enable         ),
  .TE     ( ijtag_sel && ijtag_se && tck_enable         )
);
clock_mux21 tessent_persistent_cell_ssn_bus_clock_mux (
  .Y      ( ssn_bus_clock_muxed_with_tck                ),
  .S0     ( tck_enable                                  ),
  .A0     ( bus_clock_int                               ),
  .A1     ( tck_clock_gated                             )
);
assign ssn_bus_data_in0_muxed_with_ijtag_si = (streaming_through_ijtag_en) ? ijtag_si : bus_data_in_int[0];
assign ssn_bus_data_in1_muxed_with_ijtag_si = (bus_register_ijtag_access_en) ? ijtag_si : bus_data_in_int[1];
 
processor_core_logic_test_tessent_ssn_scan_host_1_clock_gen clock_gen (
  .clock                                               ( ssn_bus_clock_muxed_with_tck                               ),
  .enable                                              ( enable_buf                                                 ),
  .enable_sync                                         ( enable_sync                                                ),
  .loop_back_en                                        ( loop_back_en                                               ),
  .ready_to_shift                                      ( ready_to_shift                                             ),
  .ready_to_capture                                    ( ready_to_capture                                           ),
  .ext_capture_mode                                    ( ext_capture_mode                                           ),
  .pulse_width_packet_cnt_is_zero                      ( pulse_width_packet_cnt_is_zero                             ),
  .edt_update_in                                       ( edt_update_from_fsm                                        ),
  .scan_en_in                                          ( scan_en_from_fsm                                           ),
  .edt_clock_en_in                                     ( edt_clock_en_from_fsm                                      ),
  .last_in_bits_in_current_bus_word                    ( last_in_bits_in_current_bus_word                           ),
  .last_scan_load_is_done                              ( last_scan_load_is_done                                     ),
  .min_shift_clock_low_width                           ( min_shift_clock_low_width                                  ),
  .min_capture_clock_low_width                         ( min_capture_clock_low_width                                ),
  .min_capture_clock_low_width_is_zero                 ( min_capture_clock_low_width_is_zero                        ),
  .packet_width_is_less_than_two_bus_clock             ( packet_width_is_less_than_two_bus_clock                    ),
  .packets_per_capture_clock_minus_one                 ( packets_per_capture_clock_minus_one                        ),
  .extra_shift_packets                                 ( extra_shift_packets                                        ),
  .scan_en_launch_packet_equal_transition_packets      ( scan_en_launch_packet_equal_transition_packets             ),
  .use_div_shift_clocks                                ( use_div_shift_clocks                                       ),
  .shift_clock_en                                      ( shift_clock_en                                             ),
  .select_capture_clock_low_width                      ( select_capture_clock_low_width                             ),
  .inject_tck_as_capture_clock                         ( inject_tck_as_capture_clock                                ),
  .ijtag_clock                                         ( ijtag_tck                                                  ),
  .scan_en                                             ( scan_en_int                                                ),
  .edt_update                                          ( edt_update                                                 ),
  .test_clock                                          ( test_clock                                                 ),
  .min_shift_clock_low_width_is_zero                   ( min_shift_clock_low_width_is_zero                          )
);
 
processor_core_logic_test_tessent_ssn_scan_host_1_fsm fsm (
  .clock                                               ( ssn_bus_clock_muxed_with_tck                               ),
  .ijtag_se                                            ( ijtag_se                                                   ),
  .ijtag_sel                                           ( ijtag_sel                                                  ),
  .ijtag_clock                                         ( ijtag_tck                                                  ),
  .streaming_through_ijtag_en                          ( streaming_through_ijtag_en                                 ),
  .scan_en_from_fsm                                    ( scan_en_from_fsm                                           ),
  .edt_update_from_fsm                                 ( edt_update_from_fsm                                        ),
  .edt_clock_en_from_fsm                               ( edt_clock_en_from_fsm                                      ),
  .capture_packets                                     ( capture_packets                                            ),
  .packets_per_capture_clock_minus_one                 ( packets_per_capture_clock_minus_one                        ),
  .ready_to_shift                                      ( ready_to_shift                                             ),
  .ready_to_capture                                    ( ready_to_capture                                           ),
  .ext_capture_mode                                    ( ext_capture_mode                                           ),
  .pulse_width_packet_cnt_is_zero                      ( pulse_width_packet_cnt_is_zero                             ),
  .enable                                              ( enable                                                     ),
  .enable_sync_reset                                   ( enable_sync_reset                                          ),
  .enable_sync                                         ( enable_sync                                                ),
  .bus_register_ijtag_access_en                        ( bus_register_ijtag_access_en                               ),
  .bus_enable_sync_reset                               ( bus_enable_sync_reset                                      ),
  .bus_sync_reset_pulse                                ( bus_sync_reset_pulse                                       ),
  .initial_offset                                      ( initial_offset                                             ),
  .sentinel_present                                    ( sentinel_present                                           ),
  .relative_initial_offset_enable                      ( relative_initial_offset_enable                             ),
  .bus_width                                           ( bus_width                                                  ),
  .bits_per_packet                                     ( bits_per_packet                                            ),
  .init_scan_load_used                                 ( init_scan_load_used                                        ),
  .disable_first_scan_load_masking                     ( disable_first_scan_load_masking                            ),
  .to_scan_in_bits                                     ( to_scan_in_bits                                            ),
  .from_scan_out_bits                                  ( from_scan_out_bits                                         ),
  .total_shift_cnt_minus_one                           ( total_shift_cnt_minus_one                                  ),
  .extra_shift_packets                                 ( extra_shift_packets                                        ),
  .packet_size                                         ( packet_size                                                ),
  .timeslot_sharing_count_minus_one                    ( timeslot_sharing_count_minus_one                           ),
  .timeslot_sharing_offset                             ( timeslot_sharing_offset                                    ),
  .force_suppress_capture                              ( force_suppress_capture                                     ),
  .initial_bit0_position                               ( initial_bit0_position                                      ),
  .min_capture_clock_low_width_is_zero                 ( min_capture_clock_low_width_is_zero                        ),
  .scan_en_transition_packets                          ( scan_en_transition_packets                                 ),
  .scan_en_launch_packet                               ( scan_en_launch_packet                                      ),
  .scan_en_launch_packet_equal_transition_packets      ( scan_en_launch_packet_equal_transition_packets             ),
  .edt_update_falling_transition_words                 ( edt_update_falling_transition_words                        ),
  .edt_update_falling_launch_word                      ( edt_update_falling_launch_word                             ),
  .to_scan_in0_d                                       ( to_scan_in0_d                                              ),
  .start_of_packet                                     ( start_of_packet                                            ),
  .in_bit0_position_in_first_bus_word                  ( in_bit0_position_in_first_bus_word                         ),
  .in_bits_in_remaining_bus_words                      ( in_bits_in_remaining_bus_words                             ),
  .received_in_bit_cnt                                 ( received_in_bit_cnt                                        ),
  .last_in_bits_in_current_bus_word                    ( last_in_bits_in_current_bus_word                           ),
  .drive_bus_out_gated                                 ( drive_bus_out_gated                                        ),
  .drive_bus_out_disable                               ( drive_bus_out_disable                                      ),
  .in_bit_storage_en                                   ( in_bit_storage_en                                          ),
  .loop_back_en                                        ( loop_back_en                                               ),
  .select_capture_clock_low_width                      ( select_capture_clock_low_width                             ),
  .next_to_scan_word_bits_in_bus                       ( next_to_scan_word_bits_in_bus                              ),
  .start_of_next_to_scan_word_in_bus                   ( start_of_next_to_scan_word_in_bus                          ),
  .have_in_bits_in_remaining_bus_words                 ( have_in_bits_in_remaining_bus_words                        ),
  .the_next_to_scan_word_starts_in_bus                 ( the_next_to_scan_word_starts_in_bus                        ),
  .inject_tck_as_capture_clock                         ( inject_tck_as_capture_clock                                ),
  .infinite_shift_mode                                 ( infinite_shift_mode                                        ),
  .last_scan_load_is_done                              ( last_scan_load_is_done                                     )
);
 
processor_core_logic_test_tessent_ssn_scan_host_1_ijtag_registers ijtag_registers (
  .ijtag_reset                                         ( ijtag_reset                                                ),
  .ijtag_clock                                         ( ijtag_tck                                                  ),
  .ijtag_sel                                           ( ijtag_sel                                                  ),
  .ijtag_ce                                            ( ijtag_ce                                                   ),
  .ijtag_se                                            ( ijtag_se                                                   ),
  .ijtag_ue                                            ( ijtag_ue                                                   ),
  .ijtag_si                                            ( ijtag_si                                                   ),
  .ijtag_so                                            ( ijtag_so                                                   ),
  .enable                                              ( enable                                                     ),
  .enable_sync                                         ( enable_sync                                                ),
  .initial_offset                                      ( initial_offset                                             ),
  .relative_initial_offset_enable                      ( relative_initial_offset_enable                             ),
  .bus_width                                           ( bus_width                                                  ),
  .bits_per_packet                                     ( bits_per_packet                                            ),
  .init_scan_load_used                                 ( init_scan_load_used                                        ),
  .disable_first_scan_load_masking                     ( disable_first_scan_load_masking                            ),
  .to_scan_in_bits                                     ( to_scan_in_bits                                            ),
  .from_scan_out_bits                                  ( from_scan_out_bits                                         ),
  .total_shift_cnt_minus_one                           ( total_shift_cnt_minus_one                                  ),
  .extra_shift_packets                                 ( extra_shift_packets                                        ),
  .packet_size                                         ( packet_size                                                ),
  .timeslot_sharing_count_minus_one                    ( timeslot_sharing_count_minus_one                           ),
  .timeslot_sharing_offset                             ( timeslot_sharing_offset                                    ),
  .force_suppress_capture                              ( force_suppress_capture                                     ),
  .initial_bit0_position                               ( initial_bit0_position                                      ),
  .loop_back_en                                        ( loop_back_en                                               ),
  .streaming_through_ijtag_en                          ( streaming_through_ijtag_en                                 ),
  .bus_data_out0                                       ( bus_data_out_int[0]                                        ),
  .bus_register_ijtag_access_en                        ( bus_register_ijtag_access_en                               ),
  .capture_packets                                     ( capture_packets                                            ),
  .packets_per_capture_clock_minus_one                 ( packets_per_capture_clock_minus_one                        ),
  .scan_en_transition_packets                          ( scan_en_transition_packets                                 ),
  .scan_en_launch_packet                               ( scan_en_launch_packet                                      ),
  .edt_update_falling_transition_words                 ( edt_update_falling_transition_words                        ),
  .edt_update_falling_launch_word                      ( edt_update_falling_launch_word                             ),
  .min_shift_clock_low_width                           ( min_shift_clock_low_width                                  ),
  .min_capture_clock_low_width                         ( min_capture_clock_low_width                                ),
  .packet_width_is_less_than_two_bus_clock             ( packet_width_is_less_than_two_bus_clock                    ),
  .infinite_shift_mode                                 ( infinite_shift_mode                                        )
);
 
processor_core_logic_test_tessent_ssn_scan_host_1_datapath datapath (
  .bus_register_ijtag_access_en                        ( bus_register_ijtag_access_en                               ),
  .ijtag_se                                            ( ijtag_se                                                   ),
  .clock                                               ( ssn_bus_clock_muxed_with_tck                               ),
  .bus_in                                              ( {ssn_bus_data_in1_muxed_with_ijtag_si, ssn_bus_data_in0_muxed_with_ijtag_si}  ),
  .bus_out                                             ( bus_data_out_int                                           ),
  .to_scan_in                                          ( to_scan_in_int                                             ),
  .to_scan_in0_d                                       ( to_scan_in0_d                                              ),
  .from_scan_out                                       ( from_scan_out_int                                          ),
  .from_scan_out_en_per_bit                            ( from_scan_out_en_per_bit                                   ),
  .to_scan_in_bits                                     ( to_scan_in_bits                                            ),
  .from_scan_out_bits                                  ( from_scan_out_bits                                         ),
  .min_shift_clock_low_width_is_zero                   ( min_shift_clock_low_width_is_zero                          ),
  .start_of_packet                                     ( start_of_packet                                            ),
  .in_bit0_position_in_first_bus_word                  ( in_bit0_position_in_first_bus_word                         ),
  .in_bits_in_remaining_bus_words                      ( in_bits_in_remaining_bus_words                             ),
  .received_in_bit_cnt                                 ( received_in_bit_cnt                                        ),
  .bus_width                                           ( bus_width                                                  ),
  .sentinel_present                                    ( sentinel_present                                           ),
  .bus_sync_reset_pulse                                ( bus_sync_reset_pulse                                       ),
  .enable_sync                                         ( enable_sync                                                ),
  .last_in_bits_in_current_bus_word                    ( last_in_bits_in_current_bus_word                           ),
  .drive_bus_out_gated                                 ( drive_bus_out_gated                                        ),
  .drive_bus_out_disable                               ( drive_bus_out_disable                                      ),
  .use_div_shift_clocks                                ( use_div_shift_clocks                                       ),
  .shift_clock_en                                      ( shift_clock_en                                             ),
  .in_bit_storage_en                                   ( in_bit_storage_en                                          ),
  .start_of_next_to_scan_word_in_bus                   ( start_of_next_to_scan_word_in_bus                          ),
  .have_in_bits_in_remaining_bus_words                 ( have_in_bits_in_remaining_bus_words                        ),
  .the_next_to_scan_word_starts_in_bus                 ( the_next_to_scan_word_starts_in_bus                        ),
  .next_to_scan_word_bits_in_bus                       ( next_to_scan_word_bits_in_bus                              )
);
 
endmodule
 
module processor_core_logic_test_tessent_ssn_scan_host_1_datapath (
  input wire             bus_register_ijtag_access_en,
  input wire             ijtag_se,
  input wire             clock,
  input wire  [1:0]      bus_in,
  output wire [1:0]      bus_out,
  output wire [32:0]     to_scan_in,
  output reg             to_scan_in0_d,
  input wire  [32:0]     from_scan_out,
  output wire [32:0]     from_scan_out_en_per_bit,
  input wire  [5:0]      to_scan_in_bits,
  input wire  [5:0]      from_scan_out_bits,
  input wire             min_shift_clock_low_width_is_zero,
  input wire             start_of_packet,
  input wire  [1:0]      in_bit0_position_in_first_bus_word,
  input wire  [5:0]      in_bits_in_remaining_bus_words,
  input wire  [6:0]      received_in_bit_cnt,
  input wire  [1:0]      bus_width,
  output reg             sentinel_present,
  input wire             bus_sync_reset_pulse,
  input wire             enable_sync,
  input wire             last_in_bits_in_current_bus_word,
  input wire  [1:0]      drive_bus_out_gated,
  input wire             drive_bus_out_disable,
  input wire             use_div_shift_clocks,
  input wire             shift_clock_en,
  input wire  [31:0]     in_bit_storage_en,
  input wire  [1:0]      start_of_next_to_scan_word_in_bus,
  input wire             have_in_bits_in_remaining_bus_words,
  input wire             the_next_to_scan_word_starts_in_bus,
  input wire  [1:0]      next_to_scan_word_bits_in_bus
);
 
 
// Reg and wire declarations
 
reg  [1:0]               bus_register_in;
reg  [1:0]               bus_register_out;
reg                      in_bit_storage32_d;
reg                      in_bit_storage31_d;
reg                      in_bit_storage30_d;
reg                      in_bit_storage29_d;
reg                      in_bit_storage28_d;
reg                      in_bit_storage27_d;
reg                      in_bit_storage26_d;
reg                      in_bit_storage25_d;
reg                      in_bit_storage24_d;
reg                      in_bit_storage23_d;
reg                      in_bit_storage22_d;
reg                      in_bit_storage21_d;
reg                      in_bit_storage20_d;
reg                      in_bit_storage19_d;
reg                      in_bit_storage18_d;
reg                      in_bit_storage17_d;
reg                      in_bit_storage16_d;
reg                      in_bit_storage15_d;
reg                      in_bit_storage14_d;
reg                      in_bit_storage13_d;
reg                      in_bit_storage12_d;
reg                      in_bit_storage11_d;
reg                      in_bit_storage10_d;
reg                      in_bit_storage9_d;
reg                      in_bit_storage8_d;
reg                      in_bit_storage7_d;
reg                      in_bit_storage6_d;
reg                      in_bit_storage5_d;
reg                      in_bit_storage4_d;
reg                      in_bit_storage3_d;
reg                      in_bit_storage2_d;
reg                      in_bit_storage1_d;
reg                      in_bit_storage0_d;
reg                      in_bit_storage31;
reg                      in_bit_storage30;
reg                      in_bit_storage29;
reg                      in_bit_storage28;
reg                      in_bit_storage27;
reg                      in_bit_storage26;
reg                      in_bit_storage25;
reg                      in_bit_storage24;
reg                      in_bit_storage23;
reg                      in_bit_storage22;
reg                      in_bit_storage21;
reg                      in_bit_storage20;
reg                      in_bit_storage19;
reg                      in_bit_storage18;
reg                      in_bit_storage17;
reg                      in_bit_storage16;
reg                      in_bit_storage15;
reg                      in_bit_storage14;
reg                      in_bit_storage13;
reg                      in_bit_storage12;
reg                      in_bit_storage11;
reg                      in_bit_storage10;
reg                      in_bit_storage9;
reg                      in_bit_storage8;
reg                      in_bit_storage7;
reg                      in_bit_storage6;
reg                      in_bit_storage5;
reg                      in_bit_storage4;
reg                      in_bit_storage3;
reg                      in_bit_storage2;
reg                      in_bit_storage1;
reg                      in_bit_storage0;
wire [1:0]               bus_register_shifted_down_next_to_scan_in_word;
wire [32:1]              bus_register_shifted_up_current_to_scan_in_word_in_current_packet;
wire [32:1]              bus_register_shifted_up_current_to_scan_in_word_in_next_packet;
wire [1:1]               bus_register_shifted_up_next_to_scan_in_word_in_next_packet;
wire                     to_scan_in32_en;
wire                     to_scan_in32;
reg                      to_scan_in32_d;
reg                      to_scan_in32_ret_not_for_div;
reg                      to_scan_in32_ret_for_div;
wire                     to_scan_in31_en;
wire                     to_scan_in31;
reg                      to_scan_in31_d;
reg                      to_scan_in31_ret_not_for_div;
reg                      to_scan_in31_ret_for_div;
wire                     to_scan_in30_en;
wire                     to_scan_in30;
reg                      to_scan_in30_d;
reg                      to_scan_in30_ret_not_for_div;
reg                      to_scan_in30_ret_for_div;
wire                     to_scan_in29_en;
wire                     to_scan_in29;
reg                      to_scan_in29_d;
reg                      to_scan_in29_ret_not_for_div;
reg                      to_scan_in29_ret_for_div;
wire                     to_scan_in28_en;
wire                     to_scan_in28;
reg                      to_scan_in28_d;
reg                      to_scan_in28_ret_not_for_div;
reg                      to_scan_in28_ret_for_div;
wire                     to_scan_in27_en;
wire                     to_scan_in27;
reg                      to_scan_in27_d;
reg                      to_scan_in27_ret_not_for_div;
reg                      to_scan_in27_ret_for_div;
wire                     to_scan_in26_en;
wire                     to_scan_in26;
reg                      to_scan_in26_d;
reg                      to_scan_in26_ret_not_for_div;
reg                      to_scan_in26_ret_for_div;
wire                     to_scan_in25_en;
wire                     to_scan_in25;
reg                      to_scan_in25_d;
reg                      to_scan_in25_ret_not_for_div;
reg                      to_scan_in25_ret_for_div;
wire                     to_scan_in24_en;
wire                     to_scan_in24;
reg                      to_scan_in24_d;
reg                      to_scan_in24_ret_not_for_div;
reg                      to_scan_in24_ret_for_div;
wire                     to_scan_in23_en;
wire                     to_scan_in23;
reg                      to_scan_in23_d;
reg                      to_scan_in23_ret_not_for_div;
reg                      to_scan_in23_ret_for_div;
wire                     to_scan_in22_en;
wire                     to_scan_in22;
reg                      to_scan_in22_d;
reg                      to_scan_in22_ret_not_for_div;
reg                      to_scan_in22_ret_for_div;
wire                     to_scan_in21_en;
wire                     to_scan_in21;
reg                      to_scan_in21_d;
reg                      to_scan_in21_ret_not_for_div;
reg                      to_scan_in21_ret_for_div;
wire                     to_scan_in20_en;
wire                     to_scan_in20;
reg                      to_scan_in20_d;
reg                      to_scan_in20_ret_not_for_div;
reg                      to_scan_in20_ret_for_div;
wire                     to_scan_in19_en;
wire                     to_scan_in19;
reg                      to_scan_in19_d;
reg                      to_scan_in19_ret_not_for_div;
reg                      to_scan_in19_ret_for_div;
wire                     to_scan_in18_en;
wire                     to_scan_in18;
reg                      to_scan_in18_d;
reg                      to_scan_in18_ret_not_for_div;
reg                      to_scan_in18_ret_for_div;
wire                     to_scan_in17_en;
wire                     to_scan_in17;
reg                      to_scan_in17_d;
reg                      to_scan_in17_ret_not_for_div;
reg                      to_scan_in17_ret_for_div;
wire                     to_scan_in16_en;
wire                     to_scan_in16;
reg                      to_scan_in16_d;
reg                      to_scan_in16_ret_not_for_div;
reg                      to_scan_in16_ret_for_div;
wire                     to_scan_in15_en;
wire                     to_scan_in15;
reg                      to_scan_in15_d;
reg                      to_scan_in15_ret_not_for_div;
reg                      to_scan_in15_ret_for_div;
wire                     to_scan_in14_en;
wire                     to_scan_in14;
reg                      to_scan_in14_d;
reg                      to_scan_in14_ret_not_for_div;
reg                      to_scan_in14_ret_for_div;
wire                     to_scan_in13_en;
wire                     to_scan_in13;
reg                      to_scan_in13_d;
reg                      to_scan_in13_ret_not_for_div;
reg                      to_scan_in13_ret_for_div;
wire                     to_scan_in12_en;
wire                     to_scan_in12;
reg                      to_scan_in12_d;
reg                      to_scan_in12_ret_not_for_div;
reg                      to_scan_in12_ret_for_div;
wire                     to_scan_in11_en;
wire                     to_scan_in11;
reg                      to_scan_in11_d;
reg                      to_scan_in11_ret_not_for_div;
reg                      to_scan_in11_ret_for_div;
wire                     to_scan_in10_en;
wire                     to_scan_in10;
reg                      to_scan_in10_d;
reg                      to_scan_in10_ret_not_for_div;
reg                      to_scan_in10_ret_for_div;
wire                     to_scan_in9_en;
wire                     to_scan_in9;
reg                      to_scan_in9_d;
reg                      to_scan_in9_ret_not_for_div;
reg                      to_scan_in9_ret_for_div;
wire                     to_scan_in8_en;
wire                     to_scan_in8;
reg                      to_scan_in8_d;
reg                      to_scan_in8_ret_not_for_div;
reg                      to_scan_in8_ret_for_div;
wire                     to_scan_in7_en;
wire                     to_scan_in7;
reg                      to_scan_in7_d;
reg                      to_scan_in7_ret_not_for_div;
reg                      to_scan_in7_ret_for_div;
wire                     to_scan_in6_en;
wire                     to_scan_in6;
reg                      to_scan_in6_d;
reg                      to_scan_in6_ret_not_for_div;
reg                      to_scan_in6_ret_for_div;
wire                     to_scan_in5_en;
wire                     to_scan_in5;
reg                      to_scan_in5_d;
reg                      to_scan_in5_ret_not_for_div;
reg                      to_scan_in5_ret_for_div;
wire                     to_scan_in4_en;
wire                     to_scan_in4;
reg                      to_scan_in4_d;
reg                      to_scan_in4_ret_not_for_div;
reg                      to_scan_in4_ret_for_div;
wire                     to_scan_in3_en;
wire                     to_scan_in3;
reg                      to_scan_in3_d;
reg                      to_scan_in3_ret_not_for_div;
reg                      to_scan_in3_ret_for_div;
wire                     to_scan_in2_en;
wire                     to_scan_in2;
reg                      to_scan_in2_d;
reg                      to_scan_in2_ret_not_for_div;
reg                      to_scan_in2_ret_for_div;
wire                     to_scan_in1_en;
wire                     to_scan_in1;
reg                      to_scan_in1_d;
reg                      to_scan_in1_ret_not_for_div;
reg                      to_scan_in1_ret_for_div;
wire                     to_scan_in0_en;
wire                     to_scan_in0;
reg                      to_scan_in0_ret_not_for_div;
reg                      to_scan_in0_ret_for_div;
reg  [1:0]               from_scan_out_to_bus_shifted_up;
reg                      from_scan_out_to_bus1;
reg                      from_scan_out_to_bus0;
wire [32:0]              from_scan_out_storage;
reg  [32:0]              from_scan_out_storage_p;
wire [1:0]               from_scan_out_storage_shifted_down_current_word_current_packet;
wire [1:0]               from_scan_out_current_word_shifted_up_next_packet;
wire [1:1]               from_scan_out_next_word_shifted_up;
wire [1:1]               from_scan_out_next_word_shifted_up_next_packet;
wire                     from_scan_out_en;
reg   [32:0]             from_scan_out_ret_n;
wire  [32:0]             from_scan_out_selected;
wire  [32:0]             from_scan_out_mux;
wire  [5:0]              unused_from_scan_out_bits;
wire  [32:0]             from_scan_out_mask;
reg                      last_in_bits_in_current_bus_word_ret;
  
// Body implementation
assign from_scan_out_en =                    (min_shift_clock_low_width_is_zero)     ? last_in_bits_in_current_bus_word_ret :
                                                                                       last_in_bits_in_current_bus_word;
assign from_scan_out_en_per_bit =            (~enable_sync) ? {33{1'b1}} 
                                                            : {33{from_scan_out_en && ~drive_bus_out_disable}} & from_scan_out_mask;
  
 
// synopsys sync_set_reset "enable_sync"
always @ (negedge clock) begin
  last_in_bits_in_current_bus_word_ret <= last_in_bits_in_current_bus_word && min_shift_clock_low_width_is_zero;
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
// synopsys sync_set_reset "enable_sync"
always @ (negedge clock) begin
  if (~enable_sync) begin
    from_scan_out_ret_n <= 33'b0;
  end else begin
    if (last_in_bits_in_current_bus_word_ret) begin
      from_scan_out_ret_n <=  from_scan_out;
    end
  end
end
// spyglass enable_block W391
 
mux21 tessent_persistent_cell_from_scan_out_mux32 (
      .Y                                ( from_scan_out_selected[32]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[32]                ),
      .A0                               ( from_scan_out_mux[32]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux31 (
      .Y                                ( from_scan_out_selected[31]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[31]                ),
      .A0                               ( from_scan_out_mux[31]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux30 (
      .Y                                ( from_scan_out_selected[30]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[30]                ),
      .A0                               ( from_scan_out_mux[30]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux29 (
      .Y                                ( from_scan_out_selected[29]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[29]                ),
      .A0                               ( from_scan_out_mux[29]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux28 (
      .Y                                ( from_scan_out_selected[28]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[28]                ),
      .A0                               ( from_scan_out_mux[28]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux27 (
      .Y                                ( from_scan_out_selected[27]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[27]                ),
      .A0                               ( from_scan_out_mux[27]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux26 (
      .Y                                ( from_scan_out_selected[26]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[26]                ),
      .A0                               ( from_scan_out_mux[26]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux25 (
      .Y                                ( from_scan_out_selected[25]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[25]                ),
      .A0                               ( from_scan_out_mux[25]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux24 (
      .Y                                ( from_scan_out_selected[24]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[24]                ),
      .A0                               ( from_scan_out_mux[24]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux23 (
      .Y                                ( from_scan_out_selected[23]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[23]                ),
      .A0                               ( from_scan_out_mux[23]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux22 (
      .Y                                ( from_scan_out_selected[22]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[22]                ),
      .A0                               ( from_scan_out_mux[22]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux21 (
      .Y                                ( from_scan_out_selected[21]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[21]                ),
      .A0                               ( from_scan_out_mux[21]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux20 (
      .Y                                ( from_scan_out_selected[20]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[20]                ),
      .A0                               ( from_scan_out_mux[20]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux19 (
      .Y                                ( from_scan_out_selected[19]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[19]                ),
      .A0                               ( from_scan_out_mux[19]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux18 (
      .Y                                ( from_scan_out_selected[18]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[18]                ),
      .A0                               ( from_scan_out_mux[18]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux17 (
      .Y                                ( from_scan_out_selected[17]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[17]                ),
      .A0                               ( from_scan_out_mux[17]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux16 (
      .Y                                ( from_scan_out_selected[16]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[16]                ),
      .A0                               ( from_scan_out_mux[16]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux15 (
      .Y                                ( from_scan_out_selected[15]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[15]                ),
      .A0                               ( from_scan_out_mux[15]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux14 (
      .Y                                ( from_scan_out_selected[14]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[14]                ),
      .A0                               ( from_scan_out_mux[14]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux13 (
      .Y                                ( from_scan_out_selected[13]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[13]                ),
      .A0                               ( from_scan_out_mux[13]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux12 (
      .Y                                ( from_scan_out_selected[12]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[12]                ),
      .A0                               ( from_scan_out_mux[12]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux11 (
      .Y                                ( from_scan_out_selected[11]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[11]                ),
      .A0                               ( from_scan_out_mux[11]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux10 (
      .Y                                ( from_scan_out_selected[10]             ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[10]                ),
      .A0                               ( from_scan_out_mux[10]                  )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux9 (
      .Y                                ( from_scan_out_selected[9]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[9]                 ),
      .A0                               ( from_scan_out_mux[9]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux8 (
      .Y                                ( from_scan_out_selected[8]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[8]                 ),
      .A0                               ( from_scan_out_mux[8]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux7 (
      .Y                                ( from_scan_out_selected[7]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[7]                 ),
      .A0                               ( from_scan_out_mux[7]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux6 (
      .Y                                ( from_scan_out_selected[6]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[6]                 ),
      .A0                               ( from_scan_out_mux[6]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux5 (
      .Y                                ( from_scan_out_selected[5]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[5]                 ),
      .A0                               ( from_scan_out_mux[5]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux4 (
      .Y                                ( from_scan_out_selected[4]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[4]                 ),
      .A0                               ( from_scan_out_mux[4]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux3 (
      .Y                                ( from_scan_out_selected[3]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[3]                 ),
      .A0                               ( from_scan_out_mux[3]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux2 (
      .Y                                ( from_scan_out_selected[2]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[2]                 ),
      .A0                               ( from_scan_out_mux[2]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux1 (
      .Y                                ( from_scan_out_selected[1]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[1]                 ),
      .A0                               ( from_scan_out_mux[1]                   )
);
 
mux21 tessent_persistent_cell_from_scan_out_mux0 (
      .Y                                ( from_scan_out_selected[0]              ),
      .S0                               ( min_shift_clock_low_width_is_zero      ),
      .A1                               ( from_scan_out_ret_n[0]                 ),
      .A0                               ( from_scan_out_mux[0]                   )
);
 
 
assign from_scan_out_mux                          = from_scan_out;
 
assign unused_from_scan_out_bits                  = 6'd33 - from_scan_out_bits[5:0];
assign from_scan_out_mask                         = {33{1'b1}} << unused_from_scan_out_bits >> unused_from_scan_out_bits;
 
 
 
// synopsys sync_set_reset "bus_sync_reset_pulse"
always @ (posedge clock) begin
  if (bus_sync_reset_pulse) begin
    bus_register_in <= 2'b0;
  end else begin
    if (bus_register_ijtag_access_en) begin
      if (ijtag_se) begin
        bus_register_in <= {bus_in[1],bus_register_in[1:1]};
      end
    end else begin
      bus_register_in <= bus_in;
    end
  end
end
 
always @ (*) begin
  if (bus_width > 1) begin
    sentinel_present = &bus_register_in[1:0];
  end else begin
    sentinel_present = bus_register_in[0];
  end
end
 
// synopsys sync_set_reset "enable_sync"
always @ (posedge clock) begin
  if (~enable_sync) begin
    from_scan_out_storage_p <= 33'b0;
  end else begin
    if (last_in_bits_in_current_bus_word) begin
      from_scan_out_storage_p <= from_scan_out_selected;
    end
  end
end
assign from_scan_out_storage = from_scan_out_storage_p;
 
// Result value won't be greater than total number of expected bit count, so result value always will fit into the variable
// spyglass disable_block W164a W484 STARC-2.10.6.1
wire [6:0] received_in_bit_cnt_plus_in_bits_in_remaining_bus_words    = received_in_bit_cnt + in_bits_in_remaining_bus_words;
// spyglass enable_block W164a W484 STARC-2.10.6.1
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 32) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 32) begin 
      in_bit_storage32_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[32:32];
    end else begin
      in_bit_storage32_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[32:32];
    end
  end else begin
    in_bit_storage32_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 31) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 31) begin 
      in_bit_storage31_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[31:31];
    end else begin
      in_bit_storage31_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[31:31];
    end
  end else begin
    in_bit_storage31_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 30) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 30) begin 
      in_bit_storage30_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[30:30];
    end else begin
      in_bit_storage30_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[30:30];
    end
  end else begin
    in_bit_storage30_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 29) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 29) begin 
      in_bit_storage29_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[29:29];
    end else begin
      in_bit_storage29_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[29:29];
    end
  end else begin
    in_bit_storage29_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 28) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 28) begin 
      in_bit_storage28_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[28:28];
    end else begin
      in_bit_storage28_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[28:28];
    end
  end else begin
    in_bit_storage28_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 27) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 27) begin 
      in_bit_storage27_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[27:27];
    end else begin
      in_bit_storage27_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[27:27];
    end
  end else begin
    in_bit_storage27_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 26) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 26) begin 
      in_bit_storage26_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[26:26];
    end else begin
      in_bit_storage26_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[26:26];
    end
  end else begin
    in_bit_storage26_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 25) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 25) begin 
      in_bit_storage25_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[25:25];
    end else begin
      in_bit_storage25_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[25:25];
    end
  end else begin
    in_bit_storage25_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 24) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 24) begin 
      in_bit_storage24_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[24:24];
    end else begin
      in_bit_storage24_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[24:24];
    end
  end else begin
    in_bit_storage24_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 23) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 23) begin 
      in_bit_storage23_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[23:23];
    end else begin
      in_bit_storage23_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[23:23];
    end
  end else begin
    in_bit_storage23_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 22) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 22) begin 
      in_bit_storage22_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[22:22];
    end else begin
      in_bit_storage22_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[22:22];
    end
  end else begin
    in_bit_storage22_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 21) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 21) begin 
      in_bit_storage21_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[21:21];
    end else begin
      in_bit_storage21_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[21:21];
    end
  end else begin
    in_bit_storage21_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 20) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 20) begin 
      in_bit_storage20_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[20:20];
    end else begin
      in_bit_storage20_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[20:20];
    end
  end else begin
    in_bit_storage20_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 19) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 19) begin 
      in_bit_storage19_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[19:19];
    end else begin
      in_bit_storage19_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[19:19];
    end
  end else begin
    in_bit_storage19_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 18) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 18) begin 
      in_bit_storage18_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[18:18];
    end else begin
      in_bit_storage18_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[18:18];
    end
  end else begin
    in_bit_storage18_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 17) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 17) begin 
      in_bit_storage17_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[17:17];
    end else begin
      in_bit_storage17_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[17:17];
    end
  end else begin
    in_bit_storage17_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 16) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 16) begin 
      in_bit_storage16_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[16:16];
    end else begin
      in_bit_storage16_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[16:16];
    end
  end else begin
    in_bit_storage16_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 15) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 15) begin 
      in_bit_storage15_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[15:15];
    end else begin
      in_bit_storage15_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[15:15];
    end
  end else begin
    in_bit_storage15_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 14) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 14) begin 
      in_bit_storage14_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[14:14];
    end else begin
      in_bit_storage14_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[14:14];
    end
  end else begin
    in_bit_storage14_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 13) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 13) begin 
      in_bit_storage13_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[13:13];
    end else begin
      in_bit_storage13_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[13:13];
    end
  end else begin
    in_bit_storage13_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 12) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 12) begin 
      in_bit_storage12_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[12:12];
    end else begin
      in_bit_storage12_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[12:12];
    end
  end else begin
    in_bit_storage12_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 11) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 11) begin 
      in_bit_storage11_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[11:11];
    end else begin
      in_bit_storage11_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[11:11];
    end
  end else begin
    in_bit_storage11_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 10) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 10) begin 
      in_bit_storage10_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[10:10];
    end else begin
      in_bit_storage10_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[10:10];
    end
  end else begin
    in_bit_storage10_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 9) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 9) begin 
      in_bit_storage9_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[9:9];
    end else begin
      in_bit_storage9_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[9:9];
    end
  end else begin
    in_bit_storage9_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 8) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 8) begin 
      in_bit_storage8_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[8:8];
    end else begin
      in_bit_storage8_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[8:8];
    end
  end else begin
    in_bit_storage8_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 7) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 7) begin 
      in_bit_storage7_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[7:7];
    end else begin
      in_bit_storage7_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[7:7];
    end
  end else begin
    in_bit_storage7_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 6) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 6) begin 
      in_bit_storage6_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[6:6];
    end else begin
      in_bit_storage6_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[6:6];
    end
  end else begin
    in_bit_storage6_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 5) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 5) begin 
      in_bit_storage5_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[5:5];
    end else begin
      in_bit_storage5_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[5:5];
    end
  end else begin
    in_bit_storage5_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 4) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 4) begin 
      in_bit_storage4_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[4:4];
    end else begin
      in_bit_storage4_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[4:4];
    end
  end else begin
    in_bit_storage4_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 3) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 3) begin 
      in_bit_storage3_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[3:3];
    end else begin
      in_bit_storage3_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[3:3];
    end
  end else begin
    in_bit_storage3_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 2) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 2) begin 
      in_bit_storage2_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[2:2];
    end else begin
      in_bit_storage2_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[2:2];
    end
  end else begin
    in_bit_storage2_d = 1'b0;
  end
end
  
always @ (*) begin
  if (received_in_bit_cnt != 0 && received_in_bit_cnt <= 1) begin
    if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words > 1) begin 
      in_bit_storage1_d = bus_register_shifted_up_current_to_scan_in_word_in_current_packet[1:1];
    end else begin
      in_bit_storage1_d = bus_register_shifted_up_current_to_scan_in_word_in_next_packet[1:1];
    end
  end else begin
    if (next_to_scan_word_bits_in_bus > 1) begin
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (start_of_next_to_scan_word_in_bus < in_bits_in_remaining_bus_words) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        // This is guarded in previous if statement so there won't be truncation
        // spyglass disable_block W116
        if (in_bits_in_remaining_bus_words - start_of_next_to_scan_word_in_bus > 1) begin
        // spyglass enable_block W116
          in_bit_storage1_d = bus_register_shifted_down_next_to_scan_in_word[1:1];
        end else begin
          in_bit_storage1_d = bus_register_shifted_up_next_to_scan_in_word_in_next_packet[1:1];
        end
      end else begin
        in_bit_storage1_d = bus_register_shifted_down_next_to_scan_in_word[1:1];
      end
    end else begin
      in_bit_storage1_d = 1'b0;
    end
  end
end
  
always @ (*) begin
  if (next_to_scan_word_bits_in_bus > 0) begin
    in_bit_storage0_d = bus_register_shifted_down_next_to_scan_in_word[0:0];
  end else begin
    in_bit_storage0_d = 1'b0;
  end
end
  
always @ (posedge clock) begin
  if (in_bit_storage_en[31]) begin
    in_bit_storage31 <= in_bit_storage31_d;
  end
  if (in_bit_storage_en[30]) begin
    in_bit_storage30 <= in_bit_storage30_d;
  end
  if (in_bit_storage_en[29]) begin
    in_bit_storage29 <= in_bit_storage29_d;
  end
  if (in_bit_storage_en[28]) begin
    in_bit_storage28 <= in_bit_storage28_d;
  end
  if (in_bit_storage_en[27]) begin
    in_bit_storage27 <= in_bit_storage27_d;
  end
  if (in_bit_storage_en[26]) begin
    in_bit_storage26 <= in_bit_storage26_d;
  end
  if (in_bit_storage_en[25]) begin
    in_bit_storage25 <= in_bit_storage25_d;
  end
  if (in_bit_storage_en[24]) begin
    in_bit_storage24 <= in_bit_storage24_d;
  end
  if (in_bit_storage_en[23]) begin
    in_bit_storage23 <= in_bit_storage23_d;
  end
  if (in_bit_storage_en[22]) begin
    in_bit_storage22 <= in_bit_storage22_d;
  end
  if (in_bit_storage_en[21]) begin
    in_bit_storage21 <= in_bit_storage21_d;
  end
  if (in_bit_storage_en[20]) begin
    in_bit_storage20 <= in_bit_storage20_d;
  end
  if (in_bit_storage_en[19]) begin
    in_bit_storage19 <= in_bit_storage19_d;
  end
  if (in_bit_storage_en[18]) begin
    in_bit_storage18 <= in_bit_storage18_d;
  end
  if (in_bit_storage_en[17]) begin
    in_bit_storage17 <= in_bit_storage17_d;
  end
  if (in_bit_storage_en[16]) begin
    in_bit_storage16 <= in_bit_storage16_d;
  end
  if (in_bit_storage_en[15]) begin
    in_bit_storage15 <= in_bit_storage15_d;
  end
  if (in_bit_storage_en[14]) begin
    in_bit_storage14 <= in_bit_storage14_d;
  end
  if (in_bit_storage_en[13]) begin
    in_bit_storage13 <= in_bit_storage13_d;
  end
  if (in_bit_storage_en[12]) begin
    in_bit_storage12 <= in_bit_storage12_d;
  end
  if (in_bit_storage_en[11]) begin
    in_bit_storage11 <= in_bit_storage11_d;
  end
  if (in_bit_storage_en[10]) begin
    in_bit_storage10 <= in_bit_storage10_d;
  end
  if (in_bit_storage_en[9]) begin
    in_bit_storage9 <= in_bit_storage9_d;
  end
  if (in_bit_storage_en[8]) begin
    in_bit_storage8 <= in_bit_storage8_d;
  end
  if (in_bit_storage_en[7]) begin
    in_bit_storage7 <= in_bit_storage7_d;
  end
  if (in_bit_storage_en[6]) begin
    in_bit_storage6 <= in_bit_storage6_d;
  end
  if (in_bit_storage_en[5]) begin
    in_bit_storage5 <= in_bit_storage5_d;
  end
  if (in_bit_storage_en[4]) begin
    in_bit_storage4 <= in_bit_storage4_d;
  end
  if (in_bit_storage_en[3]) begin
    in_bit_storage3 <= in_bit_storage3_d;
  end
  if (in_bit_storage_en[2]) begin
    in_bit_storage2 <= in_bit_storage2_d;
  end
  if (in_bit_storage_en[1]) begin
    in_bit_storage1 <= in_bit_storage1_d;
  end
  if (in_bit_storage_en[0]) begin
    in_bit_storage0 <= in_bit_storage0_d;
  end
end
 
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in32_ret_not_for_div <= in_bit_storage32_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in32_ret_for_div <= in_bit_storage32_d;
  end
end
 
assign to_scan_in32 = (use_div_shift_clocks) ? to_scan_in32_ret_for_div : to_scan_in32_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd31) begin
    to_scan_in31_d = in_bit_storage31;
  end else begin
    to_scan_in31_d = in_bit_storage31_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in31_ret_not_for_div <= to_scan_in31_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in31_ret_for_div <= to_scan_in31_d;
  end
end
 
assign to_scan_in31 = (use_div_shift_clocks) ? to_scan_in31_ret_for_div : to_scan_in31_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd30) begin
    to_scan_in30_d = in_bit_storage30;
  end else begin
    to_scan_in30_d = in_bit_storage30_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in30_ret_not_for_div <= to_scan_in30_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in30_ret_for_div <= to_scan_in30_d;
  end
end
 
assign to_scan_in30 = (use_div_shift_clocks) ? to_scan_in30_ret_for_div : to_scan_in30_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd29) begin
    to_scan_in29_d = in_bit_storage29;
  end else begin
    to_scan_in29_d = in_bit_storage29_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in29_ret_not_for_div <= to_scan_in29_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in29_ret_for_div <= to_scan_in29_d;
  end
end
 
assign to_scan_in29 = (use_div_shift_clocks) ? to_scan_in29_ret_for_div : to_scan_in29_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd28) begin
    to_scan_in28_d = in_bit_storage28;
  end else begin
    to_scan_in28_d = in_bit_storage28_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in28_ret_not_for_div <= to_scan_in28_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in28_ret_for_div <= to_scan_in28_d;
  end
end
 
assign to_scan_in28 = (use_div_shift_clocks) ? to_scan_in28_ret_for_div : to_scan_in28_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd27) begin
    to_scan_in27_d = in_bit_storage27;
  end else begin
    to_scan_in27_d = in_bit_storage27_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in27_ret_not_for_div <= to_scan_in27_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in27_ret_for_div <= to_scan_in27_d;
  end
end
 
assign to_scan_in27 = (use_div_shift_clocks) ? to_scan_in27_ret_for_div : to_scan_in27_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd26) begin
    to_scan_in26_d = in_bit_storage26;
  end else begin
    to_scan_in26_d = in_bit_storage26_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in26_ret_not_for_div <= to_scan_in26_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in26_ret_for_div <= to_scan_in26_d;
  end
end
 
assign to_scan_in26 = (use_div_shift_clocks) ? to_scan_in26_ret_for_div : to_scan_in26_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd25) begin
    to_scan_in25_d = in_bit_storage25;
  end else begin
    to_scan_in25_d = in_bit_storage25_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in25_ret_not_for_div <= to_scan_in25_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in25_ret_for_div <= to_scan_in25_d;
  end
end
 
assign to_scan_in25 = (use_div_shift_clocks) ? to_scan_in25_ret_for_div : to_scan_in25_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd24) begin
    to_scan_in24_d = in_bit_storage24;
  end else begin
    to_scan_in24_d = in_bit_storage24_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in24_ret_not_for_div <= to_scan_in24_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in24_ret_for_div <= to_scan_in24_d;
  end
end
 
assign to_scan_in24 = (use_div_shift_clocks) ? to_scan_in24_ret_for_div : to_scan_in24_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd23) begin
    to_scan_in23_d = in_bit_storage23;
  end else begin
    to_scan_in23_d = in_bit_storage23_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in23_ret_not_for_div <= to_scan_in23_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in23_ret_for_div <= to_scan_in23_d;
  end
end
 
assign to_scan_in23 = (use_div_shift_clocks) ? to_scan_in23_ret_for_div : to_scan_in23_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd22) begin
    to_scan_in22_d = in_bit_storage22;
  end else begin
    to_scan_in22_d = in_bit_storage22_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in22_ret_not_for_div <= to_scan_in22_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in22_ret_for_div <= to_scan_in22_d;
  end
end
 
assign to_scan_in22 = (use_div_shift_clocks) ? to_scan_in22_ret_for_div : to_scan_in22_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd21) begin
    to_scan_in21_d = in_bit_storage21;
  end else begin
    to_scan_in21_d = in_bit_storage21_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in21_ret_not_for_div <= to_scan_in21_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in21_ret_for_div <= to_scan_in21_d;
  end
end
 
assign to_scan_in21 = (use_div_shift_clocks) ? to_scan_in21_ret_for_div : to_scan_in21_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd20) begin
    to_scan_in20_d = in_bit_storage20;
  end else begin
    to_scan_in20_d = in_bit_storage20_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in20_ret_not_for_div <= to_scan_in20_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in20_ret_for_div <= to_scan_in20_d;
  end
end
 
assign to_scan_in20 = (use_div_shift_clocks) ? to_scan_in20_ret_for_div : to_scan_in20_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd19) begin
    to_scan_in19_d = in_bit_storage19;
  end else begin
    to_scan_in19_d = in_bit_storage19_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in19_ret_not_for_div <= to_scan_in19_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in19_ret_for_div <= to_scan_in19_d;
  end
end
 
assign to_scan_in19 = (use_div_shift_clocks) ? to_scan_in19_ret_for_div : to_scan_in19_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd18) begin
    to_scan_in18_d = in_bit_storage18;
  end else begin
    to_scan_in18_d = in_bit_storage18_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in18_ret_not_for_div <= to_scan_in18_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in18_ret_for_div <= to_scan_in18_d;
  end
end
 
assign to_scan_in18 = (use_div_shift_clocks) ? to_scan_in18_ret_for_div : to_scan_in18_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd17) begin
    to_scan_in17_d = in_bit_storage17;
  end else begin
    to_scan_in17_d = in_bit_storage17_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in17_ret_not_for_div <= to_scan_in17_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in17_ret_for_div <= to_scan_in17_d;
  end
end
 
assign to_scan_in17 = (use_div_shift_clocks) ? to_scan_in17_ret_for_div : to_scan_in17_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd16) begin
    to_scan_in16_d = in_bit_storage16;
  end else begin
    to_scan_in16_d = in_bit_storage16_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in16_ret_not_for_div <= to_scan_in16_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in16_ret_for_div <= to_scan_in16_d;
  end
end
 
assign to_scan_in16 = (use_div_shift_clocks) ? to_scan_in16_ret_for_div : to_scan_in16_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd15) begin
    to_scan_in15_d = in_bit_storage15;
  end else begin
    to_scan_in15_d = in_bit_storage15_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in15_ret_not_for_div <= to_scan_in15_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in15_ret_for_div <= to_scan_in15_d;
  end
end
 
assign to_scan_in15 = (use_div_shift_clocks) ? to_scan_in15_ret_for_div : to_scan_in15_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd14) begin
    to_scan_in14_d = in_bit_storage14;
  end else begin
    to_scan_in14_d = in_bit_storage14_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in14_ret_not_for_div <= to_scan_in14_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in14_ret_for_div <= to_scan_in14_d;
  end
end
 
assign to_scan_in14 = (use_div_shift_clocks) ? to_scan_in14_ret_for_div : to_scan_in14_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd13) begin
    to_scan_in13_d = in_bit_storage13;
  end else begin
    to_scan_in13_d = in_bit_storage13_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in13_ret_not_for_div <= to_scan_in13_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in13_ret_for_div <= to_scan_in13_d;
  end
end
 
assign to_scan_in13 = (use_div_shift_clocks) ? to_scan_in13_ret_for_div : to_scan_in13_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd12) begin
    to_scan_in12_d = in_bit_storage12;
  end else begin
    to_scan_in12_d = in_bit_storage12_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in12_ret_not_for_div <= to_scan_in12_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in12_ret_for_div <= to_scan_in12_d;
  end
end
 
assign to_scan_in12 = (use_div_shift_clocks) ? to_scan_in12_ret_for_div : to_scan_in12_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd11) begin
    to_scan_in11_d = in_bit_storage11;
  end else begin
    to_scan_in11_d = in_bit_storage11_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in11_ret_not_for_div <= to_scan_in11_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in11_ret_for_div <= to_scan_in11_d;
  end
end
 
assign to_scan_in11 = (use_div_shift_clocks) ? to_scan_in11_ret_for_div : to_scan_in11_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd10) begin
    to_scan_in10_d = in_bit_storage10;
  end else begin
    to_scan_in10_d = in_bit_storage10_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in10_ret_not_for_div <= to_scan_in10_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in10_ret_for_div <= to_scan_in10_d;
  end
end
 
assign to_scan_in10 = (use_div_shift_clocks) ? to_scan_in10_ret_for_div : to_scan_in10_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd9) begin
    to_scan_in9_d = in_bit_storage9;
  end else begin
    to_scan_in9_d = in_bit_storage9_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in9_ret_not_for_div <= to_scan_in9_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in9_ret_for_div <= to_scan_in9_d;
  end
end
 
assign to_scan_in9 = (use_div_shift_clocks) ? to_scan_in9_ret_for_div : to_scan_in9_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd8) begin
    to_scan_in8_d = in_bit_storage8;
  end else begin
    to_scan_in8_d = in_bit_storage8_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in8_ret_not_for_div <= to_scan_in8_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in8_ret_for_div <= to_scan_in8_d;
  end
end
 
assign to_scan_in8 = (use_div_shift_clocks) ? to_scan_in8_ret_for_div : to_scan_in8_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd7) begin
    to_scan_in7_d = in_bit_storage7;
  end else begin
    to_scan_in7_d = in_bit_storage7_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in7_ret_not_for_div <= to_scan_in7_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in7_ret_for_div <= to_scan_in7_d;
  end
end
 
assign to_scan_in7 = (use_div_shift_clocks) ? to_scan_in7_ret_for_div : to_scan_in7_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd6) begin
    to_scan_in6_d = in_bit_storage6;
  end else begin
    to_scan_in6_d = in_bit_storage6_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in6_ret_not_for_div <= to_scan_in6_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in6_ret_for_div <= to_scan_in6_d;
  end
end
 
assign to_scan_in6 = (use_div_shift_clocks) ? to_scan_in6_ret_for_div : to_scan_in6_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd5) begin
    to_scan_in5_d = in_bit_storage5;
  end else begin
    to_scan_in5_d = in_bit_storage5_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in5_ret_not_for_div <= to_scan_in5_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in5_ret_for_div <= to_scan_in5_d;
  end
end
 
assign to_scan_in5 = (use_div_shift_clocks) ? to_scan_in5_ret_for_div : to_scan_in5_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd4) begin
    to_scan_in4_d = in_bit_storage4;
  end else begin
    to_scan_in4_d = in_bit_storage4_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in4_ret_not_for_div <= to_scan_in4_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in4_ret_for_div <= to_scan_in4_d;
  end
end
 
assign to_scan_in4 = (use_div_shift_clocks) ? to_scan_in4_ret_for_div : to_scan_in4_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd3) begin
    to_scan_in3_d = in_bit_storage3;
  end else begin
    to_scan_in3_d = in_bit_storage3_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in3_ret_not_for_div <= to_scan_in3_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in3_ret_for_div <= to_scan_in3_d;
  end
end
 
assign to_scan_in3 = (use_div_shift_clocks) ? to_scan_in3_ret_for_div : to_scan_in3_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd2) begin
    to_scan_in2_d = in_bit_storage2;
  end else begin
    to_scan_in2_d = in_bit_storage2_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in2_ret_not_for_div <= to_scan_in2_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in2_ret_for_div <= to_scan_in2_d;
  end
end
 
assign to_scan_in2 = (use_div_shift_clocks) ? to_scan_in2_ret_for_div : to_scan_in2_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd1) begin
    to_scan_in1_d = in_bit_storage1;
  end else begin
    to_scan_in1_d = in_bit_storage1_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in1_ret_not_for_div <= to_scan_in1_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in1_ret_for_div <= to_scan_in1_d;
  end
end
 
assign to_scan_in1 = (use_div_shift_clocks) ? to_scan_in1_ret_for_div : to_scan_in1_ret_not_for_div;
 
always @ (*) begin
  if (received_in_bit_cnt > 7'd0) begin
    to_scan_in0_d = in_bit_storage0;
  end else begin
    to_scan_in0_d = in_bit_storage0_d;
  end
end
 
// Negedge clock is intended, this is retiming cell.
// spyglass disable_block W391
always @ (negedge clock) begin
  if (shift_clock_en && min_shift_clock_low_width_is_zero) begin
    to_scan_in0_ret_not_for_div <= to_scan_in0_d;
  end
end
// spyglass enable_block W391
 
always @ (posedge clock) begin
  if (shift_clock_en) begin
    to_scan_in0_ret_for_div <= to_scan_in0_d;
  end
end
 
assign to_scan_in0 = (use_div_shift_clocks) ? to_scan_in0_ret_for_div : to_scan_in0_ret_not_for_div;
 
         
assign to_scan_in32_en                = (to_scan_in_bits > 6'd32);
assign to_scan_in[32]                 = to_scan_in32 & to_scan_in32_en;
assign to_scan_in31_en                = (to_scan_in_bits > 6'd31);
assign to_scan_in[31]                 = to_scan_in31 & to_scan_in31_en;
assign to_scan_in30_en                = (to_scan_in_bits > 6'd30);
assign to_scan_in[30]                 = to_scan_in30 & to_scan_in30_en;
assign to_scan_in29_en                = (to_scan_in_bits > 6'd29);
assign to_scan_in[29]                 = to_scan_in29 & to_scan_in29_en;
assign to_scan_in28_en                = (to_scan_in_bits > 6'd28);
assign to_scan_in[28]                 = to_scan_in28 & to_scan_in28_en;
assign to_scan_in27_en                = (to_scan_in_bits > 6'd27);
assign to_scan_in[27]                 = to_scan_in27 & to_scan_in27_en;
assign to_scan_in26_en                = (to_scan_in_bits > 6'd26);
assign to_scan_in[26]                 = to_scan_in26 & to_scan_in26_en;
assign to_scan_in25_en                = (to_scan_in_bits > 6'd25);
assign to_scan_in[25]                 = to_scan_in25 & to_scan_in25_en;
assign to_scan_in24_en                = (to_scan_in_bits > 6'd24);
assign to_scan_in[24]                 = to_scan_in24 & to_scan_in24_en;
assign to_scan_in23_en                = (to_scan_in_bits > 6'd23);
assign to_scan_in[23]                 = to_scan_in23 & to_scan_in23_en;
assign to_scan_in22_en                = (to_scan_in_bits > 6'd22);
assign to_scan_in[22]                 = to_scan_in22 & to_scan_in22_en;
assign to_scan_in21_en                = (to_scan_in_bits > 6'd21);
assign to_scan_in[21]                 = to_scan_in21 & to_scan_in21_en;
assign to_scan_in20_en                = (to_scan_in_bits > 6'd20);
assign to_scan_in[20]                 = to_scan_in20 & to_scan_in20_en;
assign to_scan_in19_en                = (to_scan_in_bits > 6'd19);
assign to_scan_in[19]                 = to_scan_in19 & to_scan_in19_en;
assign to_scan_in18_en                = (to_scan_in_bits > 6'd18);
assign to_scan_in[18]                 = to_scan_in18 & to_scan_in18_en;
assign to_scan_in17_en                = (to_scan_in_bits > 6'd17);
assign to_scan_in[17]                 = to_scan_in17 & to_scan_in17_en;
assign to_scan_in16_en                = (to_scan_in_bits > 6'd16);
assign to_scan_in[16]                 = to_scan_in16 & to_scan_in16_en;
assign to_scan_in15_en                = (to_scan_in_bits > 6'd15);
assign to_scan_in[15]                 = to_scan_in15 & to_scan_in15_en;
assign to_scan_in14_en                = (to_scan_in_bits > 6'd14);
assign to_scan_in[14]                 = to_scan_in14 & to_scan_in14_en;
assign to_scan_in13_en                = (to_scan_in_bits > 6'd13);
assign to_scan_in[13]                 = to_scan_in13 & to_scan_in13_en;
assign to_scan_in12_en                = (to_scan_in_bits > 6'd12);
assign to_scan_in[12]                 = to_scan_in12 & to_scan_in12_en;
assign to_scan_in11_en                = (to_scan_in_bits > 6'd11);
assign to_scan_in[11]                 = to_scan_in11 & to_scan_in11_en;
assign to_scan_in10_en                = (to_scan_in_bits > 6'd10);
assign to_scan_in[10]                 = to_scan_in10 & to_scan_in10_en;
assign to_scan_in9_en                 = (to_scan_in_bits > 6'd9);
assign to_scan_in[9]                  = to_scan_in9 & to_scan_in9_en;
assign to_scan_in8_en                 = (to_scan_in_bits > 6'd8);
assign to_scan_in[8]                  = to_scan_in8 & to_scan_in8_en;
assign to_scan_in7_en                 = (to_scan_in_bits > 6'd7);
assign to_scan_in[7]                  = to_scan_in7 & to_scan_in7_en;
assign to_scan_in6_en                 = (to_scan_in_bits > 6'd6);
assign to_scan_in[6]                  = to_scan_in6 & to_scan_in6_en;
assign to_scan_in5_en                 = (to_scan_in_bits > 6'd5);
assign to_scan_in[5]                  = to_scan_in5 & to_scan_in5_en;
assign to_scan_in4_en                 = (to_scan_in_bits > 6'd4);
assign to_scan_in[4]                  = to_scan_in4 & to_scan_in4_en;
assign to_scan_in3_en                 = (to_scan_in_bits > 6'd3);
assign to_scan_in[3]                  = to_scan_in3 & to_scan_in3_en;
assign to_scan_in2_en                 = (to_scan_in_bits > 6'd2);
assign to_scan_in[2]                  = to_scan_in2 & to_scan_in2_en;
assign to_scan_in1_en                 = (to_scan_in_bits > 6'd1);
assign to_scan_in[1]                  = to_scan_in1 & to_scan_in1_en;
assign to_scan_in0_en                 = (to_scan_in_bits > 6'd0);
assign to_scan_in[0]                  = to_scan_in0 & to_scan_in0_en;
 
always @ (*) begin
  if (in_bits_in_remaining_bus_words > 1) begin
    if (the_next_to_scan_word_starts_in_bus && start_of_next_to_scan_word_in_bus <= 1 && start_of_next_to_scan_word_in_bus != 0) begin
      from_scan_out_to_bus1 = from_scan_out_next_word_shifted_up[1:1];
    end else begin
      from_scan_out_to_bus1 = from_scan_out_storage_shifted_down_current_word_current_packet[1:1];
    end
  end else if (start_of_packet && in_bit0_position_in_first_bus_word <= 1) begin
    if (the_next_to_scan_word_starts_in_bus && start_of_next_to_scan_word_in_bus <= 1 && start_of_next_to_scan_word_in_bus != 0 &&
        (start_of_next_to_scan_word_in_bus != in_bit0_position_in_first_bus_word || have_in_bits_in_remaining_bus_words)) begin
      if (start_of_next_to_scan_word_in_bus < in_bit0_position_in_first_bus_word) begin
        from_scan_out_to_bus1 = from_scan_out_next_word_shifted_up_next_packet[1:1];
      end else begin
        from_scan_out_to_bus1 = from_scan_out_next_word_shifted_up[1:1];
      end
    end else begin
      from_scan_out_to_bus1 = from_scan_out_current_word_shifted_up_next_packet[1:1];
    end
  end else begin
    from_scan_out_to_bus1 = 1'b0;
  end
end
 
always @ (*) begin
  if (in_bits_in_remaining_bus_words > 0) begin
    from_scan_out_to_bus0 = from_scan_out_storage_shifted_down_current_word_current_packet[0:0];
  end else if (start_of_packet && in_bit0_position_in_first_bus_word <= 0) begin
    from_scan_out_to_bus0 = from_scan_out_current_word_shifted_up_next_packet[0:0];
  end else begin
    from_scan_out_to_bus0 = 1'b0;
  end
end
 
// synopsys sync_set_reset "bus_sync_reset_pulse"
always @ (posedge clock) begin
  if (bus_sync_reset_pulse) begin
    bus_register_out[1:1] <= 1'b0;
  end else begin
    if (bus_register_ijtag_access_en) begin
      if (ijtag_se) begin
        bus_register_out[1:1] <= bus_register_in[0];
      end
    end else begin
      if (drive_bus_out_gated[1]) begin
        bus_register_out[1:1] <= from_scan_out_to_bus1;
      end else begin
        bus_register_out[1:1] <= bus_register_in[1:1];
      end
    end
  end
end
 
// synopsys sync_set_reset "bus_sync_reset_pulse"
always @ (posedge clock) begin
  if (bus_sync_reset_pulse) begin
    bus_register_out[0:0] <= 1'b0;
  end else begin
    if (bus_register_ijtag_access_en) begin
      if (ijtag_se) begin
        bus_register_out[0:0] <= bus_register_out[1];
      end
    end else begin
      if (drive_bus_out_gated[0]) begin
        bus_register_out[0:0] <= from_scan_out_to_bus0;
      end else begin
        bus_register_out[0:0] <= bus_register_in[0:0];
      end
    end
  end
end
 
assign bus_out = bus_register_out;
  
// Result after datapath_shifters processing is used only when start_of_packet is set so value at this point will be correct, and will fit into expected bit count
// spyglass disable_block W116 W164a W484 STARC-2.10.6.1
wire [5:0] in_bits_in_remaining_bus_words_minus_start_of_next_to_scan_word_in_bus = in_bits_in_remaining_bus_words-start_of_next_to_scan_word_in_bus;
// spyglass enable_block W116 W164a W484 STARC-2.10.6.1
// Result after datapath_shifters processing is used only when start_of_packet is set so value at this point will be correct
// spyglass disable_block W116 W164a W484 STARC-2.10.6.1
wire [1:0] in_bit0_position_in_first_bus_word_minus_bits_for_current_word = in_bit0_position_in_first_bus_word - (in_bits_in_remaining_bus_words-start_of_next_to_scan_word_in_bus);
// spyglass enable_block W116 W164a W484 STARC-2.10.6.1
processor_core_logic_test_tessent_ssn_scan_host_1_datapath_shifters datapath_shifters (
  .bus_register_in                                                          ( bus_register_in                                                         ),
  .bus_register_shifted_down_next_to_scan_in_word                           ( bus_register_shifted_down_next_to_scan_in_word                          ),
  .bus_register_shifted_up_current_to_scan_in_word_in_current_packet        ( bus_register_shifted_up_current_to_scan_in_word_in_current_packet       ),
  .bus_register_shifted_up_current_to_scan_in_word_in_next_packet           ( bus_register_shifted_up_current_to_scan_in_word_in_next_packet          ),
  .in_bits_in_remaining_bus_words_minus_start_of_next_to_scan_word_in_bus   ( in_bits_in_remaining_bus_words_minus_start_of_next_to_scan_word_in_bus  ),
  .bus_register_shifted_up_next_to_scan_in_word_in_next_packet              ( bus_register_shifted_up_next_to_scan_in_word_in_next_packet             ),
  .from_scan_out_storage                                                    ( from_scan_out_storage                                                   ),
  .from_scan_out_storage_shifted_down_current_word_current_packet           ( from_scan_out_storage_shifted_down_current_word_current_packet          ),
  .from_scan_out_current_word_shifted_up_next_packet                        ( from_scan_out_current_word_shifted_up_next_packet                       ),
  .in_bit0_position_in_first_bus_word_minus_bits_for_current_word           ( in_bit0_position_in_first_bus_word_minus_bits_for_current_word          ),
  .from_scan_out_source                                                     ( from_scan_out_selected[32:0]                                            ),
  .from_scan_out_next_word_shifted_up                                       ( from_scan_out_next_word_shifted_up                                      ),
  .from_scan_out_next_word_shifted_up_next_packet                           ( from_scan_out_next_word_shifted_up_next_packet                          ),
                                                              
  .start_of_next_to_scan_word_in_bus                                        ( start_of_next_to_scan_word_in_bus                                       ),
  .in_bit0_position_in_first_bus_word                                       ( in_bit0_position_in_first_bus_word                                      ),
  .received_in_bit_cnt                                                      ( received_in_bit_cnt                                                     ),
  .received_in_bit_cnt_plus_in_bits_in_remaining_bus_words                  ( received_in_bit_cnt_plus_in_bits_in_remaining_bus_words                 )
 
);
 
endmodule
 
module processor_core_logic_test_tessent_ssn_scan_host_1_fsm (
  input wire             clock,
  input wire             ijtag_se,
  input wire             ijtag_sel,
  input wire             ijtag_clock,
  input wire             streaming_through_ijtag_en,
  output wire            scan_en_from_fsm,
  output wire            edt_update_from_fsm,
  output wire            edt_clock_en_from_fsm,
  input wire  [2:0]      capture_packets,
  output wire            ext_capture_mode,
  input wire  [2:0]      packets_per_capture_clock_minus_one,
  input wire             enable,
  input wire             enable_sync_reset,
  output wire            enable_sync,
  input wire             bus_register_ijtag_access_en,
  input wire             bus_enable_sync_reset,
  output wire            bus_sync_reset_pulse,
  input wire  [30:0]     initial_offset,
  input wire             sentinel_present,
  input wire             relative_initial_offset_enable,
  input wire  [1:0]      bus_width,
  input wire  [5:0]      bits_per_packet,
  input wire             init_scan_load_used,
  input wire             disable_first_scan_load_masking,
  input wire  [5:0]      to_scan_in_bits,
  input wire  [5:0]      from_scan_out_bits,
  input wire  [27:0]     total_shift_cnt_minus_one,
  input wire  [27:0]     extra_shift_packets,
  input wire  [15:0]     packet_size,
  input wire  [2:0]      timeslot_sharing_count_minus_one,
  input wire  [2:0]      timeslot_sharing_offset,
  input wire             force_suppress_capture,
  input wire  [1:0]      initial_bit0_position,
  input wire  [6:0]      scan_en_transition_packets,
  input wire  [6:0]      scan_en_launch_packet,
  input wire  [6:0]      edt_update_falling_transition_words,
  input wire  [6:0]      edt_update_falling_launch_word,
  input wire             to_scan_in0_d,
  input wire             min_capture_clock_low_width_is_zero,
  output wire            start_of_packet,
  output wire            ready_to_shift, ready_to_capture, pulse_width_packet_cnt_is_zero,
  output wire [1:0]      in_bit0_position_in_first_bus_word,
  output reg  [5:0]      in_bits_in_remaining_bus_words,
  output reg  [6:0]      received_in_bit_cnt,
  output wire            last_in_bits_in_current_bus_word,
  output wire [1:0]      drive_bus_out_gated,
  output reg             drive_bus_out_disable,
  output reg  [31:0]     in_bit_storage_en,
  input wire             loop_back_en,
  output wire            select_capture_clock_low_width,
  output wire            scan_en_launch_packet_equal_transition_packets,
  output reg  [1:0]      start_of_next_to_scan_word_in_bus,
  output reg  [1:0]      next_to_scan_word_bits_in_bus,
  output wire            have_in_bits_in_remaining_bus_words,
  output reg             the_next_to_scan_word_starts_in_bus,
  output wire            inject_tck_as_capture_clock,
  input wire             infinite_shift_mode,
  output wire            last_scan_load_is_done
);
 
// Reg and wire declarations
 
reg    [30:0]            initial_offset_cnt;
reg                      start_initial_offset_cnt;
wire                     start_initial_offset_cnt_gated;
reg    [15:0]            packet_bit_cnt;
reg    [2:0]             timeslot_sharing_counter;
reg                      packet_is_used, skip_initial_non_throttleable_packets;
reg    [5:0]             next_in_bits_in_remaining_bus_words;
reg    [6:0]             next_received_in_bit_cnt;
reg                      last_in_bits_in_current_bus_word_int;
reg    [27:0]            to_scan_in_word_cnt_int;
wire   [27:0]            to_scan_in_word_cnt;
reg                      enable_sync_ff;
reg                      bus_sync_reset_ff;
reg    [2:0]             state, next_state;
reg                      edt_update_control0, next_edt_update_control0;
wire                     suppress_capture;
reg                      last_scan_load_is_done_int, next_last_scan_load_is_done;
reg                      next_drive_bus_out_disable;
reg                      first_scan_load_is_done, next_first_scan_load_is_done;
reg                      ready_for_packets;
reg    [2:0]             capture_cycle_cnt, next_capture_cycle_cnt;
reg                      scan_en_ff, next_scan_en_ff;
reg                      edt_update_ff, next_edt_update_ff;
reg    [6:0]             mcp_or_pulse_width_packet_cnt, next_mcp_or_pulse_width_packet_cnt;
reg                      load_scan_en_transition_packets, load_edt_update_falling_transition_words, load_packets_per_capture_clock_minus_one, decrement_mcp_or_pulse_width_packet_cnt;
reg                      drive_out_packets, next_drive_out_packets;
wire                     going_to_edt_update;
wire                     going_to_edt_update_not_from_shift;
wire   [5:0]             total_to_scan_in_bits;
wire   [5:0]             total_from_scan_out_bits;
wire   [5:0]             expected_bit_num;
wire   [5:0]             received_in_bit_cnt_total;
wire   [1:0]             in_bits_in_first_bus_word;
reg                      last_post_shift_word, next_last_post_shift_word;
reg    [1:0]             drive_bus_out;
wire   [5:0]             total_scan_bits;
wire                     state_is_edt_update;
reg                      state_is_edt_update_ff;
reg                      ijtag_se_pipelined;
wire                     non_word_width_states;
wire                     start_of_packet_ungated;
 
localparam               edt_update_enum          = 3'd0;
localparam               first_shift_enum         = 3'd1;
localparam               shift_enum               = 3'd2;
localparam               last_two_so_shifts_enum  = 3'd3;
localparam               extra_shift_packets_enum = 3'd4;
localparam               pre_capture_mcp_enum     = 3'd5;
localparam               capture_enum             = 3'd6;
localparam               post_capture_mcp_enum    = 3'd7;
localparam               below_packet_boundary = 0;
localparam               above_packet_boundary = 1;
localparam               current_word          = 1;
localparam               next_word             = 0;
 
// Body implementation
wire packets_are_throttleable = (state==edt_update_enum) || (state==first_shift_enum) || 
                               (state==shift_enum)      || (state==last_two_so_shifts_enum);
 
wire enable_sync_and_ready_for_packets = (enable_sync && ready_for_packets);
 
// synopsys async_set_reset "enable"
// synopsys sync_set_reset "enable_sync_and_ready_for_packets"
always @ (posedge clock or negedge enable) begin
  if (~enable) begin
    timeslot_sharing_counter              <= 3'b0;
    packet_is_used                        <= 1'b0;
    skip_initial_non_throttleable_packets <= 1'b0;
  end else if (~enable_sync_and_ready_for_packets) begin
    timeslot_sharing_counter              <= 3'b0;
    packet_is_used                        <= (timeslot_sharing_offset == 3'b0);
    skip_initial_non_throttleable_packets <= 1'b0;
  end else if (start_of_packet_ungated && (timeslot_sharing_count_minus_one != 3'b0)) begin
    if (timeslot_sharing_counter == timeslot_sharing_count_minus_one) begin
      timeslot_sharing_counter <= 3'b0;
    end else begin
      timeslot_sharing_counter <= timeslot_sharing_counter + 3'b1;
    end
    if (packets_are_throttleable) begin
      if (timeslot_sharing_counter == timeslot_sharing_count_minus_one) begin
        if (last_post_shift_word && (received_in_bit_cnt == (expected_bit_num - 6'b1)) && 
            (timeslot_sharing_offset == timeslot_sharing_count_minus_one) &&
            ~(extra_shift_packets == 28'b0 && suppress_capture && ~ext_capture_mode && (mcp_or_pulse_width_packet_cnt == 7'b0))) begin
          packet_is_used <= 1'b1;
        end else begin
          packet_is_used <= (timeslot_sharing_offset == 3'b0);
        end
      end else begin
        packet_is_used   <= ((timeslot_sharing_counter + 3'b1) == timeslot_sharing_offset);
      end
    end else begin
      if ((state == post_capture_mcp_enum && (mcp_or_pulse_width_packet_cnt <= 7'b1)) ||
          (state == extra_shift_packets_enum && to_scan_in_word_cnt == 28'b0 && suppress_capture && ~ext_capture_mode && (mcp_or_pulse_width_packet_cnt == 7'b0)) ||
          (state == pre_capture_mcp_enum && suppress_capture && ~ext_capture_mode && mcp_or_pulse_width_packet_cnt == 7'b0)) begin
        packet_is_used      <= (timeslot_sharing_offset == 3'b0);
      end else if (skip_initial_non_throttleable_packets && (timeslot_sharing_counter != timeslot_sharing_count_minus_one)) begin
        packet_is_used   <= 1'b0;
      end else begin
        packet_is_used   <= 1'b1;
      end
    end
    if (last_post_shift_word && (received_in_bit_cnt == (expected_bit_num - 6'b1)) &&
        (timeslot_sharing_offset != timeslot_sharing_count_minus_one) && (timeslot_sharing_counter == timeslot_sharing_offset)) begin
      skip_initial_non_throttleable_packets <= 1'b1;
    end else if (timeslot_sharing_counter == timeslot_sharing_count_minus_one) begin
      skip_initial_non_throttleable_packets <= 1'b0;
    end 
  end
end
assign start_of_packet = start_of_packet_ungated & packet_is_used;
assign scan_en_launch_packet_equal_transition_packets = (scan_en_transition_packets == scan_en_launch_packet);
assign non_word_width_states                          = (state == extra_shift_packets_enum) || (state == pre_capture_mcp_enum) || 
                                                        (state == capture_enum) || (state == post_capture_mcp_enum);
assign select_capture_clock_low_width                 = (non_word_width_states & !(next_state == edt_update_enum)) || 
                                                        ((state == last_two_so_shifts_enum) && (next_state != last_two_so_shifts_enum));
assign total_to_scan_in_bits = to_scan_in_bits;
assign total_from_scan_out_bits = from_scan_out_bits;
assign total_scan_bits = (total_to_scan_in_bits>=total_from_scan_out_bits) ? total_to_scan_in_bits : total_from_scan_out_bits;
 
// Gated reset signal usage is intended, reset signal is generated based on multiple signals.
// spyglass disable_block STARC05-1.3.2.1a
// synopsys async_set_reset "enable_sync_reset"
always @ (posedge clock or posedge enable_sync_reset) begin
  if (enable_sync_reset) begin
    enable_sync_ff       <= 1'b0;
  end else begin
    enable_sync_ff       <= enable;
  end
end
// spyglass enable_block STARC05-1.3.2.1a
 
// synopsys async_set_reset "bus_enable_sync_reset"
always @ (posedge clock or posedge bus_enable_sync_reset) begin
  if (bus_enable_sync_reset) begin
    bus_sync_reset_ff       <= 1'b1;
  end else begin
    bus_sync_reset_ff       <= 1'b0;
  end
end
 
assign bus_sync_reset_pulse = bus_sync_reset_ff & ~bus_register_ijtag_access_en;
 
buf02 tessent_persistent_cell_enable_sync_buf (
  .A                    ( enable_sync_ff  ),
  .Y                    ( enable_sync  )
);
 
buf02 tessent_persistent_cell_state_is_edt_update_buf (
  .A                    ( state_is_edt_update_ff  ),
  .Y                    ( state_is_edt_update  )
);
    
assign ext_capture_mode                 = (capture_packets == 3'b0);
assign edt_update_from_fsm              = enable_sync && edt_update_ff && ~last_scan_load_is_done;
assign edt_clock_en_from_fsm            = enable_sync && state_is_edt_update && (mcp_or_pulse_width_packet_cnt == edt_update_falling_transition_words);
assign ready_to_shift                   = (state == first_shift_enum) || (state == shift_enum);
assign ready_to_capture                 = (state == capture_enum);
assign scan_en_from_fsm                 = enable_sync && scan_en_ff;
assign inject_tck_as_capture_clock      = (enable_sync & ~(ijtag_se & ijtag_sel & streaming_through_ijtag_en) & ~ijtag_se_pipelined & ~suppress_capture & ext_capture_mode & ((state == post_capture_mcp_enum) || (state == pre_capture_mcp_enum) || (state == extra_shift_packets_enum) || (state == last_two_so_shifts_enum)));
// Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
// spyglass disable_block W362 STARC05-2.10.3.1
assign pulse_width_packet_cnt_is_zero   = (packets_per_capture_clock_minus_one == 3'b0) ? 1'b1 :
                                          (min_capture_clock_low_width_is_zero) ? (mcp_or_pulse_width_packet_cnt == packets_per_capture_clock_minus_one) 
                                                                                : (mcp_or_pulse_width_packet_cnt == 7'b0);
// spyglass enable_block W362 STARC05-2.10.3.1
 
always @ (posedge ijtag_clock) begin
  ijtag_se_pipelined <= ijtag_se & ijtag_sel & streaming_through_ijtag_en;
end
 
// synopsys async_set_reset "enable"
always @ (posedge clock or negedge enable) begin
  // This async usage is due to prevent glitches
  // spyglass disable_block STARC05-1.3.1.3
  if (~enable) begin
  // spyglass enable_block STARC05-1.3.1.3
    drive_bus_out_disable         <= 1'b0;
    capture_cycle_cnt             <= 3'b0;
    mcp_or_pulse_width_packet_cnt <= 7'b0;
  end else if (~enable_sync) begin
    drive_bus_out_disable         <= ~loop_back_en & ~disable_first_scan_load_masking;
    capture_cycle_cnt             <= capture_packets;
    mcp_or_pulse_width_packet_cnt <= edt_update_falling_transition_words;
  end else begin
    drive_bus_out_disable         <= next_drive_bus_out_disable;
    capture_cycle_cnt             <= next_capture_cycle_cnt;
    mcp_or_pulse_width_packet_cnt <= next_mcp_or_pulse_width_packet_cnt;
  end
end
// synopsys async_set_reset "enable"
// synopsys sync_set_reset "enable_sync"
always @ (posedge clock or negedge enable) begin
  if (~enable) begin
    state                             <= edt_update_enum;
    state_is_edt_update_ff            <= 1'b1;
    edt_update_control0               <= 1'b0;
    last_scan_load_is_done_int        <= 1'b0;
    first_scan_load_is_done           <= 1'b0;
    scan_en_ff                        <= 1'b1;
    edt_update_ff                     <= 1'b1;
    last_post_shift_word              <= 1'b0;
    drive_out_packets                 <= 1'b0;
  end else if (~enable_sync) begin
    state                             <= edt_update_enum;
    state_is_edt_update_ff            <= 1'b1;
    edt_update_control0               <= 1'b0;
    last_scan_load_is_done_int        <= 1'b0;
    first_scan_load_is_done           <= 1'b0;
    scan_en_ff                        <= 1'b1;
    edt_update_ff                     <= 1'b1;
    last_post_shift_word              <= 1'b0;
    drive_out_packets                 <= 1'b0;
  end else begin
    state                             <= next_state;
    state_is_edt_update_ff            <= (next_state == edt_update_enum);
    edt_update_control0               <= next_edt_update_control0;
    last_scan_load_is_done_int        <= next_last_scan_load_is_done;
    first_scan_load_is_done           <= next_first_scan_load_is_done;
    scan_en_ff                        <= next_scan_en_ff;
    edt_update_ff                     <= next_edt_update_ff;
    last_post_shift_word              <= next_last_post_shift_word;
    drive_out_packets                 <= next_drive_out_packets;
  end
end
 
always @ (*) begin
  next_capture_cycle_cnt        = capture_cycle_cnt; 
  if (state == capture_enum && last_in_bits_in_current_bus_word && mcp_or_pulse_width_packet_cnt == 7'b0) begin
    if (capture_cycle_cnt == 3'b1) begin
      next_capture_cycle_cnt = capture_packets;
    end else begin
      next_capture_cycle_cnt = capture_cycle_cnt - 3'b1;
    end
  end
end 
 
always @ (*) begin
  next_drive_out_packets    = drive_out_packets;
  if (last_in_bits_in_current_bus_word) begin
    if (state == shift_enum) begin
      next_drive_out_packets = 1'b1;
    end else if ((state == last_two_so_shifts_enum) && last_post_shift_word) begin
      next_drive_out_packets = 1'b0;
    end
  end
end
 
always @ (*) begin
  next_edt_update_control0 = edt_update_control0;
  if (last_in_bits_in_current_bus_word && state_is_edt_update && (mcp_or_pulse_width_packet_cnt == edt_update_falling_transition_words)) begin
    next_edt_update_control0 = to_scan_in0_d;
  end
end
 
assign suppress_capture = edt_update_control0 || force_suppress_capture;
assign last_scan_load_is_done = last_scan_load_is_done_int & ~force_suppress_capture;
  
always @ (*) begin
  next_last_scan_load_is_done = last_scan_load_is_done_int;
  if (last_in_bits_in_current_bus_word && (state == last_two_so_shifts_enum) && ~last_post_shift_word) begin
    next_last_scan_load_is_done = to_scan_in0_d || last_scan_load_is_done;
  end
end
   
always @ (*) begin
  next_drive_bus_out_disable = drive_bus_out_disable;
  if (state_is_edt_update && last_scan_load_is_done) begin
    next_drive_bus_out_disable = 1'b1;
  end else if (going_to_edt_update && !last_scan_load_is_done && (first_scan_load_is_done || ~init_scan_load_used || disable_first_scan_load_masking)) begin
    next_drive_bus_out_disable = 1'b0;
  end
end
always @ (*) begin
  next_first_scan_load_is_done = first_scan_load_is_done;
  if (going_to_edt_update) begin
    next_first_scan_load_is_done = 1'b1;
  end
end
  
always @ (*) begin
  next_mcp_or_pulse_width_packet_cnt    = mcp_or_pulse_width_packet_cnt;
  if (load_edt_update_falling_transition_words || load_scan_en_transition_packets || load_packets_per_capture_clock_minus_one) begin
    if (load_edt_update_falling_transition_words) begin
      next_mcp_or_pulse_width_packet_cnt  = edt_update_falling_transition_words;
    end else if (load_scan_en_transition_packets) begin
      next_mcp_or_pulse_width_packet_cnt  = scan_en_transition_packets;
    end else begin
      next_mcp_or_pulse_width_packet_cnt  = {4'b0, packets_per_capture_clock_minus_one};
    end
  end else if ((mcp_or_pulse_width_packet_cnt != 7'b0) && decrement_mcp_or_pulse_width_packet_cnt) begin
    next_mcp_or_pulse_width_packet_cnt  = mcp_or_pulse_width_packet_cnt - 7'b1;
  end
end
always @ (*) begin
  load_scan_en_transition_packets          = 1'b0;
  load_edt_update_falling_transition_words = 1'b0;
  load_packets_per_capture_clock_minus_one = 1'b0;
  decrement_mcp_or_pulse_width_packet_cnt  = 1'b0;
  if (last_in_bits_in_current_bus_word) begin
    if (((state != first_shift_enum) && (next_state == first_shift_enum)) ||
        ((state != post_capture_mcp_enum) && (next_state == post_capture_mcp_enum) && ~(suppress_capture && ~ext_capture_mode))) begin
      load_scan_en_transition_packets = 1'b1;
    end
    if ((state != edt_update_enum) && (next_state == edt_update_enum) || !ready_for_packets) begin
      load_edt_update_falling_transition_words = 1'b1;
    end
    if (((state != capture_enum) && (next_state == capture_enum)) ||
        ((next_state == capture_enum) && (mcp_or_pulse_width_packet_cnt == 7'b0))) begin
      load_packets_per_capture_clock_minus_one = 1'b1;
    end
    // In case where max_scan_chain_length = 1 extra_shift_packets and to_scan_in_word_cnt comparisons will always be true
    // spyglass disable_block AlwaysFalseTrueCond-ML
    if ( state_is_edt_update || 
         ((state == last_two_so_shifts_enum) && (( last_post_shift_word && (extra_shift_packets <= 28'd1)) ||
                                                 (~last_post_shift_word && (extra_shift_packets == 28'd0)))) ||
         ((state == extra_shift_packets_enum) && ( to_scan_in_word_cnt  <= 28'd1)) ||
         (state == pre_capture_mcp_enum) ||
         (state == capture_enum) ||
         (state == post_capture_mcp_enum)) begin
    // spyglass enable_block AlwaysFalseTrueCond-ML
     decrement_mcp_or_pulse_width_packet_cnt  = 1'b1;
    end
  end
end  
assign going_to_edt_update = (state != edt_update_enum) && (next_state == edt_update_enum);
assign going_to_edt_update_not_from_shift = going_to_edt_update && (state != last_two_so_shifts_enum);
always @ (*) begin
  next_scan_en_ff               = scan_en_ff;
  next_edt_update_ff            = edt_update_ff;
  case (state)
    edt_update_enum : begin
      if (last_in_bits_in_current_bus_word) begin
        if (~last_scan_load_is_done) begin
          next_scan_en_ff       = 1'b1;
        end
        if (mcp_or_pulse_width_packet_cnt == edt_update_falling_launch_word) begin
          next_edt_update_ff    = 1'b0;
        end
      end
    end
    
    shift_enum : begin
      if (last_in_bits_in_current_bus_word && (to_scan_in_word_cnt == extra_shift_packets) && (scan_en_transition_packets == scan_en_launch_packet) && ~infinite_shift_mode) begin
        next_edt_update_ff    = suppress_capture;
      end
    end
    last_two_so_shifts_enum : begin
      if (last_in_bits_in_current_bus_word) begin
    // In case where max_scan_chain_length = 1 extra_shift_packets comparison will always be true
    // spyglass disable_block AlwaysFalseTrueCond-ML
        if ((mcp_or_pulse_width_packet_cnt == scan_en_launch_packet) && ((last_post_shift_word && (extra_shift_packets <= 28'd1)) ||
                                                                         (~last_post_shift_word && (extra_shift_packets == 28'd0)))) begin
    // spyglass enable_block AlwaysFalseTrueCond-ML
          next_scan_en_ff = suppress_capture;
        end
        if ((next_mcp_or_pulse_width_packet_cnt == scan_en_launch_packet) || (next_state == edt_update_enum)) begin
          next_edt_update_ff    = suppress_capture;
        end
      end
    end
    extra_shift_packets_enum : begin
      if (last_in_bits_in_current_bus_word) begin
    // In case where max_scan_chain_length = 1 to_scan_in_word_cnt comparison will always be true
    // spyglass disable_block AlwaysFalseTrueCond-ML
        if (to_scan_in_word_cnt <= 28'b1) begin
    // spyglass enable_block AlwaysFalseTrueCond-ML
          if ((mcp_or_pulse_width_packet_cnt == scan_en_launch_packet) || 
              (next_state == capture_enum)) begin
            next_scan_en_ff = suppress_capture;
          end
        end
        if (to_scan_in_word_cnt == 28'b0) begin
          if (suppress_capture) begin
            if ((mcp_or_pulse_width_packet_cnt == scan_en_launch_packet) & ~last_scan_load_is_done) begin
              next_edt_update_ff    = 1'b1;
            end
          end else begin
            if (ext_capture_mode) begin
              if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
                if ((scan_en_transition_packets == scan_en_launch_packet) & ~last_scan_load_is_done) begin
                   next_edt_update_ff    = 1'b1;
                end
              end
            end
          end
        end
      end
    end
    pre_capture_mcp_enum : begin
      if (last_in_bits_in_current_bus_word) begin
        if ((mcp_or_pulse_width_packet_cnt == scan_en_launch_packet) || (next_state != pre_capture_mcp_enum)) begin
          next_scan_en_ff = suppress_capture;
        end
        if (suppress_capture) begin
          if ((mcp_or_pulse_width_packet_cnt == scan_en_launch_packet) & ~last_scan_load_is_done) begin
            next_edt_update_ff    = 1'b1;
          end
        end
      end
    end
    capture_enum : begin
      if (last_in_bits_in_current_bus_word) begin
        if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
          if (capture_cycle_cnt == 3'b1) begin
            if ((scan_en_transition_packets == scan_en_launch_packet) & ~last_scan_load_is_done) begin
              next_edt_update_ff    = 1'b1;
            end
          end
        end
      end
    end
    post_capture_mcp_enum : begin
      if (last_in_bits_in_current_bus_word) begin
        if ((next_mcp_or_pulse_width_packet_cnt == scan_en_launch_packet || going_to_edt_update) & ~last_scan_load_is_done) begin
          next_edt_update_ff    = 1'b1;
        end
        if ((mcp_or_pulse_width_packet_cnt == scan_en_launch_packet) & ~last_scan_load_is_done) begin
          next_scan_en_ff = 1'b1;
        end
      end
    end
  endcase
end
  
always @ (*) begin
  
  next_state                    = state;
  next_last_post_shift_word     = last_post_shift_word;
   
  case (state)
    edt_update_enum : begin
      if (last_in_bits_in_current_bus_word && mcp_or_pulse_width_packet_cnt == 7'b0 && ~last_scan_load_is_done) begin
        next_state                  = first_shift_enum;
      end
    end
    
    first_shift_enum : begin
      if (last_in_bits_in_current_bus_word) begin
        next_state = shift_enum;
      end
    end
 
    shift_enum : begin
      if (last_in_bits_in_current_bus_word && (to_scan_in_word_cnt == extra_shift_packets) && ~infinite_shift_mode) begin
        next_state = last_two_so_shifts_enum;
      end
    end
 
    last_two_so_shifts_enum : begin
      if (last_in_bits_in_current_bus_word) begin
        if (!last_post_shift_word) begin
          next_last_post_shift_word = 1'b1;
        end else begin
          next_last_post_shift_word = 1'b0;
          if (extra_shift_packets != 28'b0) begin
            next_state = extra_shift_packets_enum;
          end else begin
            if (suppress_capture) begin
              if (ext_capture_mode) begin
                if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
                  if (scan_en_transition_packets == 7'b0) begin
                    next_state            = edt_update_enum;
                  end else begin
                    next_state            = post_capture_mcp_enum;
                  end
                end else begin
                  next_state                 = pre_capture_mcp_enum;
                end
              end else begin
                if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
                  next_state                 = edt_update_enum;
                end else begin
                  next_state                 = pre_capture_mcp_enum;
                end
              end
            end else begin
              if (ext_capture_mode) begin
                if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
                  if (scan_en_transition_packets == 7'b0) begin
                    next_state            = edt_update_enum;
                  end else begin
                    next_state            = post_capture_mcp_enum;
                  end
                end else begin
                  next_state            = pre_capture_mcp_enum;
                end
              end else begin
                if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
                  next_state            = capture_enum;
                end else begin
                  next_state            = pre_capture_mcp_enum;
                end
              end
            end
          end
        end
      end
    end
 
    extra_shift_packets_enum : begin
      if (last_in_bits_in_current_bus_word) begin
        if (to_scan_in_word_cnt == 28'b0) begin
          if (suppress_capture) begin
            if (ext_capture_mode) begin
              if (mcp_or_pulse_width_packet_cnt != 7'b0) begin
                next_state          = pre_capture_mcp_enum;
              end else begin
                next_state          = post_capture_mcp_enum;
              end
            end else begin
              if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
                next_state                 = edt_update_enum;
              end else begin
                next_state                 = pre_capture_mcp_enum;
              end
            end
          end else begin
            if (ext_capture_mode) begin
              if (mcp_or_pulse_width_packet_cnt != 7'b0) begin
                next_state          = pre_capture_mcp_enum;
              end else begin
                next_state          = post_capture_mcp_enum;
              end
            end else begin
              if (mcp_or_pulse_width_packet_cnt == 7'b0) begin
                next_state            = capture_enum;
              end else begin
                next_state            = pre_capture_mcp_enum;
              end
            end
          end
        end
      end
    end
 
    pre_capture_mcp_enum : begin
      if (last_in_bits_in_current_bus_word && mcp_or_pulse_width_packet_cnt == 7'b0) begin
        if (suppress_capture) begin
          if (ext_capture_mode) begin
            next_state          = post_capture_mcp_enum;
          end else begin
            next_state          = edt_update_enum;
          end
        end else begin
          if (ext_capture_mode) begin
            next_state          = post_capture_mcp_enum;
          end else begin
            next_state            = capture_enum;
          end
        end
      end
    end
 
    capture_enum : begin
      if (last_in_bits_in_current_bus_word && mcp_or_pulse_width_packet_cnt == 7'b0 && capture_cycle_cnt == 3'b1) begin
        if (scan_en_transition_packets == 7'b0) begin
          next_state          = edt_update_enum;
        end else begin
          next_state          = post_capture_mcp_enum;
        end
      end
    end
    post_capture_mcp_enum : begin
      if (last_in_bits_in_current_bus_word && mcp_or_pulse_width_packet_cnt <= 7'b1) begin
        next_state                 = edt_update_enum;
      end
    end
 
  endcase
end
 
or02 tessent_persistent_cell_start_initial_offset_cnt (
  .A0                                   ( start_initial_offset_cnt               ),
  .A1                                   ( sentinel_present                       ),
  .Y                                    ( start_initial_offset_cnt_gated         )
);
// synopsys async_set_reset "enable"
always @ (posedge clock or negedge enable) begin
  if (~enable) begin
    start_initial_offset_cnt <= 1'b0;
  end else if (~enable_sync) begin
    start_initial_offset_cnt <= ~relative_initial_offset_enable;
  end else begin
    start_initial_offset_cnt <= start_initial_offset_cnt_gated;
  end
end
// synopsys async_set_reset "enable"
always @ (posedge clock or negedge enable) begin
  if (~enable) begin
    initial_offset_cnt <= 31'b0;
  end else if (~enable_sync) begin
    initial_offset_cnt <= initial_offset;
  end else begin
    if (start_initial_offset_cnt_gated) begin
      if (initial_offset_cnt != 31'b0) begin
        initial_offset_cnt <= initial_offset_cnt - 31'b1;
      end
    end
  end
end
// synopsys sync_set_reset "enable_sync"
always @ (posedge clock) begin
  if (~enable_sync) begin
    ready_for_packets   <= 1'b0;
  end else begin
    if (start_initial_offset_cnt_gated) begin
      ready_for_packets    <= (initial_offset_cnt[30:1] == 30'b0);
    end
  end
end
// synopsys async_set_reset "enable"
always @ (posedge clock or negedge enable) begin
  if (~enable) begin
    to_scan_in_word_cnt_int <= 28'b0;
  end else if (~enable_sync) begin
    to_scan_in_word_cnt_int <= total_shift_cnt_minus_one;
  end else begin  
    if (~((state==first_shift_enum) || (state==shift_enum) || (state==last_two_so_shifts_enum) || (state==extra_shift_packets_enum))) begin
      to_scan_in_word_cnt_int <= total_shift_cnt_minus_one;
    end else begin
      if (to_scan_in_word_cnt != 28'b0 && last_in_bits_in_current_bus_word && !(state==last_two_so_shifts_enum)) begin
        to_scan_in_word_cnt_int <= to_scan_in_word_cnt - 28'b1;
      end
    end
  end
end
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_27 (
  .A                                    ( to_scan_in_word_cnt_int[27]            ),
  .Y                                    ( to_scan_in_word_cnt[27]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_26 (
  .A                                    ( to_scan_in_word_cnt_int[26]            ),
  .Y                                    ( to_scan_in_word_cnt[26]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_25 (
  .A                                    ( to_scan_in_word_cnt_int[25]            ),
  .Y                                    ( to_scan_in_word_cnt[25]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_24 (
  .A                                    ( to_scan_in_word_cnt_int[24]            ),
  .Y                                    ( to_scan_in_word_cnt[24]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_23 (
  .A                                    ( to_scan_in_word_cnt_int[23]            ),
  .Y                                    ( to_scan_in_word_cnt[23]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_22 (
  .A                                    ( to_scan_in_word_cnt_int[22]            ),
  .Y                                    ( to_scan_in_word_cnt[22]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_21 (
  .A                                    ( to_scan_in_word_cnt_int[21]            ),
  .Y                                    ( to_scan_in_word_cnt[21]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_20 (
  .A                                    ( to_scan_in_word_cnt_int[20]            ),
  .Y                                    ( to_scan_in_word_cnt[20]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_19 (
  .A                                    ( to_scan_in_word_cnt_int[19]            ),
  .Y                                    ( to_scan_in_word_cnt[19]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_18 (
  .A                                    ( to_scan_in_word_cnt_int[18]            ),
  .Y                                    ( to_scan_in_word_cnt[18]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_17 (
  .A                                    ( to_scan_in_word_cnt_int[17]            ),
  .Y                                    ( to_scan_in_word_cnt[17]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_16 (
  .A                                    ( to_scan_in_word_cnt_int[16]            ),
  .Y                                    ( to_scan_in_word_cnt[16]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_15 (
  .A                                    ( to_scan_in_word_cnt_int[15]            ),
  .Y                                    ( to_scan_in_word_cnt[15]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_14 (
  .A                                    ( to_scan_in_word_cnt_int[14]            ),
  .Y                                    ( to_scan_in_word_cnt[14]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_13 (
  .A                                    ( to_scan_in_word_cnt_int[13]            ),
  .Y                                    ( to_scan_in_word_cnt[13]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_12 (
  .A                                    ( to_scan_in_word_cnt_int[12]            ),
  .Y                                    ( to_scan_in_word_cnt[12]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_11 (
  .A                                    ( to_scan_in_word_cnt_int[11]            ),
  .Y                                    ( to_scan_in_word_cnt[11]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_10 (
  .A                                    ( to_scan_in_word_cnt_int[10]            ),
  .Y                                    ( to_scan_in_word_cnt[10]                )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_9 (
  .A                                    ( to_scan_in_word_cnt_int[9]             ),
  .Y                                    ( to_scan_in_word_cnt[9]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_8 (
  .A                                    ( to_scan_in_word_cnt_int[8]             ),
  .Y                                    ( to_scan_in_word_cnt[8]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_7 (
  .A                                    ( to_scan_in_word_cnt_int[7]             ),
  .Y                                    ( to_scan_in_word_cnt[7]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_6 (
  .A                                    ( to_scan_in_word_cnt_int[6]             ),
  .Y                                    ( to_scan_in_word_cnt[6]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_5 (
  .A                                    ( to_scan_in_word_cnt_int[5]             ),
  .Y                                    ( to_scan_in_word_cnt[5]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_4 (
  .A                                    ( to_scan_in_word_cnt_int[4]             ),
  .Y                                    ( to_scan_in_word_cnt[4]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_3 (
  .A                                    ( to_scan_in_word_cnt_int[3]             ),
  .Y                                    ( to_scan_in_word_cnt[3]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_2 (
  .A                                    ( to_scan_in_word_cnt_int[2]             ),
  .Y                                    ( to_scan_in_word_cnt[2]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_1 (
  .A                                    ( to_scan_in_word_cnt_int[1]             ),
  .Y                                    ( to_scan_in_word_cnt[1]                 )
);
 
buf02 tessent_persistent_cell_to_scan_in_word_cnt_buf_0 (
  .A                                    ( to_scan_in_word_cnt_int[0]             ),
  .Y                                    ( to_scan_in_word_cnt[0]                 )
);
 
// synopsys sync_set_reset "enable_sync"
always @ (posedge clock) begin
  if (~enable_sync) begin
    packet_bit_cnt <= 16'b0;
  end else begin
    if (~ready_for_packets) begin
      if (initial_bit0_position == 2'b0) begin
        packet_bit_cnt <= packet_size;
      end else begin
        packet_bit_cnt <= {14'b0, initial_bit0_position};
      end
    end else begin
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (packet_bit_cnt > bus_width) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        // Borrow bit accomodation not needed because of previous if statement
        // spyglass disable_block W484 STARC-2.10.6.1
        packet_bit_cnt <= packet_bit_cnt - bus_width;
        // spyglass enable_block W484 STARC-2.10.6.1
      end else begin
        // packet_bit_cnt always handle packet_size and previous if statement guards bus_width and packet_bit_cnt subtraction
        // spyglass disable_block W484 STARC-2.10.6.1
        packet_bit_cnt <= packet_size - (bus_width - packet_bit_cnt[1:0]);
        // spyglass enable_block W484 STARC-2.10.6.1
      end
    end
  end
end
 
// Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
// spyglass disable_block W362 STARC05-2.10.3.1
assign start_of_packet_ungated =                   ready_for_packets &&
                                                   (packet_bit_cnt < bus_width || packet_bit_cnt == packet_size);
// spyglass enable_block W362 STARC05-2.10.3.1
 
assign in_bit0_position_in_first_bus_word =        (packet_bit_cnt==packet_size)
                                                   ? 2'b0
                                                   : packet_bit_cnt[1:0];
 
// False violation. RHS has proper width and fits into LHS.
// spyglass disable_block W164b
wire [6:0] in_bit0_position_in_first_bus_word_plus_bits_per_packet = in_bit0_position_in_first_bus_word + bits_per_packet;
// spyglass enable_block W164b
always @ (*) begin
  // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
  // spyglass disable_block W362 STARC05-2.10.3.1
  if (start_of_packet && (in_bit0_position_in_first_bus_word_plus_bits_per_packet > bus_width)) begin
  // spyglass enable_block W362 STARC05-2.10.3.1
    // There won't be overflow because in this case always next_in_bits_in_remaining_bus_words will be less than bits_per_packet due to how SSN protocol works
    // spyglass disable_block W164a W484 STARC-2.10.6.1
    next_in_bits_in_remaining_bus_words = in_bit0_position_in_first_bus_word + bits_per_packet - bus_width;
    // spyglass enable_block W164a W484 STARC-2.10.6.1
  end else begin
    // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
    // spyglass disable_block W362 STARC05-2.10.3.1
    if (in_bits_in_remaining_bus_words > bus_width) begin
    // spyglass enable_block W362 STARC05-2.10.3.1
      // This is guarded in previous if statement so there won't be truncation and negative value
      // spyglass disable_block W116 W164a W484 STARC-2.10.6.1
      next_in_bits_in_remaining_bus_words = in_bits_in_remaining_bus_words - bus_width;
      // spyglass enable_block W116 W164a W484 STARC-2.10.6.1
    end else begin
      next_in_bits_in_remaining_bus_words = 6'b0;
    end
  end
end
 
// synopsys sync_set_reset "enable_sync"
always @ (posedge clock) begin
  if (~enable_sync) begin
    in_bits_in_remaining_bus_words <= 6'b0;
  end else begin
    if (~ready_for_packets) begin
      in_bits_in_remaining_bus_words <= 6'b0;
    end else begin
      in_bits_in_remaining_bus_words <= next_in_bits_in_remaining_bus_words;
    end
  end
end
 
assign received_in_bit_cnt_total = total_scan_bits;
 
assign expected_bit_num = ((state==edt_update_enum) || (state==first_shift_enum) || (state==shift_enum) || (state==last_two_so_shifts_enum))
                               ? received_in_bit_cnt_total 
                               : bits_per_packet;
and02 tessent_persistent_cell_drive_bus_out_gated_1_and (
  .A0               ( ready_for_packets && enable_sync && ~drive_bus_out_disable && (total_from_scan_out_bits != 6'b0) ),
  .A1               ( drive_bus_out[1]             ),
  .Y                ( drive_bus_out_gated[1]       )
);
   
and02 tessent_persistent_cell_drive_bus_out_gated_0_and (
  .A0               ( ready_for_packets && enable_sync && ~drive_bus_out_disable && (total_from_scan_out_bits != 6'b0) ),
  .A1               ( drive_bus_out[0]             ),
  .Y                ( drive_bus_out_gated[0]       )
);
   
// create larger wire so that the sums don't get truncated before being compared in the < operators below
// result always will fit because it cannot exceed maximum expected bit count.
// spyglass disable_block W164a W164b W484 STARC-2.10.6.1
wire [6:0] received_in_bit_cnt_plus_in_bits_in_remaining_bus_words                                = received_in_bit_cnt + in_bits_in_remaining_bus_words;
wire [7:0] received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word = received_in_bit_cnt + in_bits_in_remaining_bus_words + in_bits_in_first_bus_word;
wire [6:0] in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word                          = in_bits_in_remaining_bus_words + in_bits_in_first_bus_word;
wire [6:0] received_in_bit_cnt_plus_bus_width                                                     = received_in_bit_cnt + bus_width;
wire [1:0] in_bit0_position_in_first_bus_word_plus_in_bits_in_first_bus_word                      = in_bit0_position_in_first_bus_word + in_bits_in_first_bus_word;
// spyglass enable_block W164a W164b W484 STARC-2.10.6.1
always @ (*) begin
  if (~enable_sync) begin
    in_bit_storage_en = 32'b0;
    last_in_bits_in_current_bus_word_int = 1'b0;
    next_received_in_bit_cnt = 7'b0;
  end else begin
    // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
    // spyglass disable_block W362 STARC05-2.10.3.1
    if (in_bits_in_remaining_bus_words > bus_width) begin
      if (received_in_bit_cnt_plus_bus_width < expected_bit_num || last_post_shift_word) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        // Result always will fit because it's guarded by received_in_bit_cnt_plus_bus_width < expected_bit_num
        // spyglass disable_block W164a W484 STARC-2.10.6.1
        next_received_in_bit_cnt = received_in_bit_cnt + bus_width;
        // spyglass enable_block W164a W484 STARC-2.10.6.1
        last_in_bits_in_current_bus_word_int = 1'b0;
        in_bit_storage_en[0] = (received_in_bit_cnt <= 0 && received_in_bit_cnt_plus_bus_width > 0 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[1] = (received_in_bit_cnt <= 1 && received_in_bit_cnt_plus_bus_width > 1 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[2] = (received_in_bit_cnt <= 2 && received_in_bit_cnt_plus_bus_width > 2 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[3] = (received_in_bit_cnt <= 3 && received_in_bit_cnt_plus_bus_width > 3 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[4] = (received_in_bit_cnt <= 4 && received_in_bit_cnt_plus_bus_width > 4 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[5] = (received_in_bit_cnt <= 5 && received_in_bit_cnt_plus_bus_width > 5 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[6] = (received_in_bit_cnt <= 6 && received_in_bit_cnt_plus_bus_width > 6 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[7] = (received_in_bit_cnt <= 7 && received_in_bit_cnt_plus_bus_width > 7 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[8] = (received_in_bit_cnt <= 8 && received_in_bit_cnt_plus_bus_width > 8 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[9] = (received_in_bit_cnt <= 9 && received_in_bit_cnt_plus_bus_width > 9 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[10] = (received_in_bit_cnt <= 10 && received_in_bit_cnt_plus_bus_width > 10 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[11] = (received_in_bit_cnt <= 11 && received_in_bit_cnt_plus_bus_width > 11 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[12] = (received_in_bit_cnt <= 12 && received_in_bit_cnt_plus_bus_width > 12 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[13] = (received_in_bit_cnt <= 13 && received_in_bit_cnt_plus_bus_width > 13 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[14] = (received_in_bit_cnt <= 14 && received_in_bit_cnt_plus_bus_width > 14 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[15] = (received_in_bit_cnt <= 15 && received_in_bit_cnt_plus_bus_width > 15 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[16] = (received_in_bit_cnt <= 16 && received_in_bit_cnt_plus_bus_width > 16 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[17] = (received_in_bit_cnt <= 17 && received_in_bit_cnt_plus_bus_width > 17 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[18] = (received_in_bit_cnt <= 18 && received_in_bit_cnt_plus_bus_width > 18 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[19] = (received_in_bit_cnt <= 19 && received_in_bit_cnt_plus_bus_width > 19 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[20] = (received_in_bit_cnt <= 20 && received_in_bit_cnt_plus_bus_width > 20 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[21] = (received_in_bit_cnt <= 21 && received_in_bit_cnt_plus_bus_width > 21 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[22] = (received_in_bit_cnt <= 22 && received_in_bit_cnt_plus_bus_width > 22 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[23] = (received_in_bit_cnt <= 23 && received_in_bit_cnt_plus_bus_width > 23 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[24] = (received_in_bit_cnt <= 24 && received_in_bit_cnt_plus_bus_width > 24 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[25] = (received_in_bit_cnt <= 25 && received_in_bit_cnt_plus_bus_width > 25 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[26] = (received_in_bit_cnt <= 26 && received_in_bit_cnt_plus_bus_width > 26 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[27] = (received_in_bit_cnt <= 27 && received_in_bit_cnt_plus_bus_width > 27 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[28] = (received_in_bit_cnt <= 28 && received_in_bit_cnt_plus_bus_width > 28 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[29] = (received_in_bit_cnt <= 29 && received_in_bit_cnt_plus_bus_width > 29 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[30] = (received_in_bit_cnt <= 30 && received_in_bit_cnt_plus_bus_width > 30 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[31] = (received_in_bit_cnt <= 31 && received_in_bit_cnt_plus_bus_width > 31 && ~going_to_edt_update_not_from_shift);
      end else begin
        last_in_bits_in_current_bus_word_int = 1'b1;
        // Result always will fit because it's guarded by if statement, those are last bits to receive so borrow condition won't exist
        // spyglass disable_block W484 STARC-2.10.6.1
        next_received_in_bit_cnt = received_in_bit_cnt_plus_bus_width - expected_bit_num;
        // spyglass enable_block W484 STARC-2.10.6.1
        in_bit_storage_en[0] = (received_in_bit_cnt <= 0 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 0);
        in_bit_storage_en[1] = (received_in_bit_cnt <= 1 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 1);
        in_bit_storage_en[2] = (received_in_bit_cnt <= 2 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 2);
        in_bit_storage_en[3] = (received_in_bit_cnt <= 3 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 3);
        in_bit_storage_en[4] = (received_in_bit_cnt <= 4 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 4);
        in_bit_storage_en[5] = (received_in_bit_cnt <= 5 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 5);
        in_bit_storage_en[6] = (received_in_bit_cnt <= 6 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 6);
        in_bit_storage_en[7] = (received_in_bit_cnt <= 7 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 7);
        in_bit_storage_en[8] = (received_in_bit_cnt <= 8 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 8);
        in_bit_storage_en[9] = (received_in_bit_cnt <= 9 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 9);
        in_bit_storage_en[10] = (received_in_bit_cnt <= 10 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 10);
        in_bit_storage_en[11] = (received_in_bit_cnt <= 11 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 11);
        in_bit_storage_en[12] = (received_in_bit_cnt <= 12 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 12);
        in_bit_storage_en[13] = (received_in_bit_cnt <= 13 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 13);
        in_bit_storage_en[14] = (received_in_bit_cnt <= 14 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 14);
        in_bit_storage_en[15] = (received_in_bit_cnt <= 15 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 15);
        in_bit_storage_en[16] = (received_in_bit_cnt <= 16 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 16);
        in_bit_storage_en[17] = (received_in_bit_cnt <= 17 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 17);
        in_bit_storage_en[18] = (received_in_bit_cnt <= 18 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 18);
        in_bit_storage_en[19] = (received_in_bit_cnt <= 19 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 19);
        in_bit_storage_en[20] = (received_in_bit_cnt <= 20 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 20);
        in_bit_storage_en[21] = (received_in_bit_cnt <= 21 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 21);
        in_bit_storage_en[22] = (received_in_bit_cnt <= 22 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 22);
        in_bit_storage_en[23] = (received_in_bit_cnt <= 23 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 23);
        in_bit_storage_en[24] = (received_in_bit_cnt <= 24 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 24);
        in_bit_storage_en[25] = (received_in_bit_cnt <= 25 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 25);
        in_bit_storage_en[26] = (received_in_bit_cnt <= 26 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 26);
        in_bit_storage_en[27] = (received_in_bit_cnt <= 27 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 27);
        in_bit_storage_en[28] = (received_in_bit_cnt <= 28 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 28);
        in_bit_storage_en[29] = (received_in_bit_cnt <= 29 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 29);
        in_bit_storage_en[30] = (received_in_bit_cnt <= 30 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 30);
        in_bit_storage_en[31] = (received_in_bit_cnt <= 31 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 31);
      end
    end else begin
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word < expected_bit_num || 
          (last_post_shift_word && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words < expected_bit_num && next_in_bits_in_remaining_bus_words != 6'b0)) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        next_received_in_bit_cnt = received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word[6:0];
        in_bit_storage_en[0] = (received_in_bit_cnt <= 0 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 0 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[1] = (received_in_bit_cnt <= 1 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 1 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[2] = (received_in_bit_cnt <= 2 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 2 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[3] = (received_in_bit_cnt <= 3 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 3 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[4] = (received_in_bit_cnt <= 4 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 4 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[5] = (received_in_bit_cnt <= 5 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 5 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[6] = (received_in_bit_cnt <= 6 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 6 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[7] = (received_in_bit_cnt <= 7 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 7 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[8] = (received_in_bit_cnt <= 8 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 8 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[9] = (received_in_bit_cnt <= 9 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 9 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[10] = (received_in_bit_cnt <= 10 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 10 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[11] = (received_in_bit_cnt <= 11 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 11 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[12] = (received_in_bit_cnt <= 12 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 12 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[13] = (received_in_bit_cnt <= 13 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 13 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[14] = (received_in_bit_cnt <= 14 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 14 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[15] = (received_in_bit_cnt <= 15 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 15 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[16] = (received_in_bit_cnt <= 16 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 16 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[17] = (received_in_bit_cnt <= 17 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 17 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[18] = (received_in_bit_cnt <= 18 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 18 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[19] = (received_in_bit_cnt <= 19 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 19 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[20] = (received_in_bit_cnt <= 20 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 20 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[21] = (received_in_bit_cnt <= 21 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 21 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[22] = (received_in_bit_cnt <= 22 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 22 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[23] = (received_in_bit_cnt <= 23 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 23 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[24] = (received_in_bit_cnt <= 24 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 24 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[25] = (received_in_bit_cnt <= 25 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 25 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[26] = (received_in_bit_cnt <= 26 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 26 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[27] = (received_in_bit_cnt <= 27 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 27 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[28] = (received_in_bit_cnt <= 28 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 28 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[29] = (received_in_bit_cnt <= 29 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 29 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[30] = (received_in_bit_cnt <= 30 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 30 && ~going_to_edt_update_not_from_shift);
        in_bit_storage_en[31] = (received_in_bit_cnt <= 31 && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > 31 && ~going_to_edt_update_not_from_shift);
        last_in_bits_in_current_bus_word_int = 1'b0;
      end else begin
        if (last_post_shift_word) begin
          // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
          // spyglass disable_block W362 STARC05-2.10.3.1
          if (in_bits_in_first_bus_word == expected_bit_num || !have_in_bits_in_remaining_bus_words) begin
          // spyglass enable_block W362 STARC05-2.10.3.1
            next_received_in_bit_cnt = 7'b0;
          end else begin
            // Bits are selected from the mux to fit into the target because bits_per_packet cannot be exceeded
            // spyglass disable_block W164a W164b
            next_received_in_bit_cnt = in_bits_in_first_bus_word;
            // spyglass enable_block W164a W164b
          end
        end else begin
          // next_received_in_bit_cnt won't be overflown due to previous checks
          // spyglass disable_block W164a
          next_received_in_bit_cnt = received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word - expected_bit_num;
          // spyglass enable_block W164a
        end
        in_bit_storage_en[0] = (received_in_bit_cnt <= 0 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 0);
        in_bit_storage_en[1] = (received_in_bit_cnt <= 1 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 1);
        in_bit_storage_en[2] = (received_in_bit_cnt <= 2 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 2);
        in_bit_storage_en[3] = (received_in_bit_cnt <= 3 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 3);
        in_bit_storage_en[4] = (received_in_bit_cnt <= 4 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 4);
        in_bit_storage_en[5] = (received_in_bit_cnt <= 5 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 5);
        in_bit_storage_en[6] = (received_in_bit_cnt <= 6 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 6);
        in_bit_storage_en[7] = (received_in_bit_cnt <= 7 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 7);
        in_bit_storage_en[8] = (received_in_bit_cnt <= 8 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 8);
        in_bit_storage_en[9] = (received_in_bit_cnt <= 9 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 9);
        in_bit_storage_en[10] = (received_in_bit_cnt <= 10 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 10);
        in_bit_storage_en[11] = (received_in_bit_cnt <= 11 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 11);
        in_bit_storage_en[12] = (received_in_bit_cnt <= 12 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 12);
        in_bit_storage_en[13] = (received_in_bit_cnt <= 13 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 13);
        in_bit_storage_en[14] = (received_in_bit_cnt <= 14 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 14);
        in_bit_storage_en[15] = (received_in_bit_cnt <= 15 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 15);
        in_bit_storage_en[16] = (received_in_bit_cnt <= 16 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 16);
        in_bit_storage_en[17] = (received_in_bit_cnt <= 17 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 17);
        in_bit_storage_en[18] = (received_in_bit_cnt <= 18 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 18);
        in_bit_storage_en[19] = (received_in_bit_cnt <= 19 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 19);
        in_bit_storage_en[20] = (received_in_bit_cnt <= 20 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 20);
        in_bit_storage_en[21] = (received_in_bit_cnt <= 21 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 21);
        in_bit_storage_en[22] = (received_in_bit_cnt <= 22 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 22);
        in_bit_storage_en[23] = (received_in_bit_cnt <= 23 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 23);
        in_bit_storage_en[24] = (received_in_bit_cnt <= 24 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 24);
        in_bit_storage_en[25] = (received_in_bit_cnt <= 25 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 25);
        in_bit_storage_en[26] = (received_in_bit_cnt <= 26 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 26);
        in_bit_storage_en[27] = (received_in_bit_cnt <= 27 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 27);
        in_bit_storage_en[28] = (received_in_bit_cnt <= 28 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 28);
        in_bit_storage_en[29] = (received_in_bit_cnt <= 29 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 29);
        in_bit_storage_en[30] = (received_in_bit_cnt <= 30 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 30);
        in_bit_storage_en[31] = (received_in_bit_cnt <= 31 && ~going_to_edt_update_not_from_shift || next_received_in_bit_cnt > 31);
        last_in_bits_in_current_bus_word_int = 1'b1;
      end
    end
  end
end
 
buf02 tessent_persistent_cell_last_in_bits_in_current_bus_word_buf (
  .A                                    ( last_in_bits_in_current_bus_word_int   ),
  .Y                                    ( last_in_bits_in_current_bus_word       )
);
 
always @ (*) begin
  if (received_in_bit_cnt == 7'b0) begin
    if (have_in_bits_in_remaining_bus_words) begin
      the_next_to_scan_word_starts_in_bus = 1'b1;
      start_of_next_to_scan_word_in_bus = 2'b0;
      if (next_received_in_bit_cnt != 0) begin
        next_to_scan_word_bits_in_bus = next_received_in_bit_cnt[1:0];
      end else begin
        next_to_scan_word_bits_in_bus = received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word[1:0];
      end
    end else if (start_of_packet) begin
      the_next_to_scan_word_starts_in_bus = 1'b1;
      start_of_next_to_scan_word_in_bus = in_bit0_position_in_first_bus_word;
      if (next_received_in_bit_cnt != 0) begin
        next_to_scan_word_bits_in_bus = next_received_in_bit_cnt[1:0];
      end else begin
        next_to_scan_word_bits_in_bus = received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word[1:0];
      end
    end else begin
      the_next_to_scan_word_starts_in_bus = 1'b1;
      start_of_next_to_scan_word_in_bus = 2'b0;
      next_to_scan_word_bits_in_bus     = 2'b0;
    end
  // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
  // spyglass disable_block W362 STARC05-2.10.3.1
  end else if (next_received_in_bit_cnt != 7'b0 && 
              ( in_bits_in_remaining_bus_words <= bus_width && received_in_bit_cnt_plus_in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word > expected_bit_num ||
                in_bits_in_remaining_bus_words > bus_width  && received_in_bit_cnt_plus_bus_width > expected_bit_num ) &&
              (!last_post_shift_word || (start_of_packet && last_in_bits_in_current_bus_word)) ) begin
  // spyglass enable_block W362 STARC05-2.10.3.1
    the_next_to_scan_word_starts_in_bus = 1'b1;
    if (start_of_packet) begin
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (next_received_in_bit_cnt > in_bits_in_first_bus_word) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        // Result always will fit into start_of_next_to_scan_word_in_bus so implicit truncation is OK
        // spyglass disable_block W164a W164b W484 STARC-2.10.6.1
        start_of_next_to_scan_word_in_bus = in_bits_in_remaining_bus_words_plus_in_bits_in_first_bus_word - next_received_in_bit_cnt;
        // spyglass enable_block W164a W164b W484 STARC-2.10.6.1
      end else begin
        if (in_bit0_position_in_first_bus_word_plus_in_bits_in_first_bus_word > bus_width) begin
        // Result will fit into start_of_next_to_scan_word_in_bus because it is guarded by (next_received_in_bit_cnt > in_bits_in_first_bus_word) if statement
        // spyglass disable_block W484 STARC-2.10.6.1
          start_of_next_to_scan_word_in_bus = bus_width - next_received_in_bit_cnt[1:0];
        // spyglass enable_block W484 STARC-2.10.6.1
        end else begin
        // Borrow condition won't exist here because it is start of packet and this is guarded by an if statement related to the else
        // spyglass disable_block W484 STARC-2.10.6.1
          start_of_next_to_scan_word_in_bus = in_bit0_position_in_first_bus_word_plus_in_bits_in_first_bus_word - next_received_in_bit_cnt[1:0];
        // spyglass enable_block W484 STARC-2.10.6.1
        end
      end
    end else begin
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (in_bits_in_remaining_bus_words > bus_width) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        // Result will be used only when next_to_scan_word_starts_in_bus = 1'b1 and at that point everything will fit with no borrow condition
        // spyglass disable_block W484 STARC-2.10.6.1
        start_of_next_to_scan_word_in_bus = bus_width - next_received_in_bit_cnt[1:0];
        // spyglass enable_block W484 STARC-2.10.6.1
      end else begin
        // Result always will fit into start_of_next_to_scan_word_in_bus so implicit truncation is OK
        // spyglass disable_block W164a W164b W484 STARC-2.10.6.1
        start_of_next_to_scan_word_in_bus = in_bits_in_remaining_bus_words - next_received_in_bit_cnt[5:0];
        // spyglass enable_block W164a W164b W484 STARC-2.10.6.1
      end
    end
    next_to_scan_word_bits_in_bus = next_received_in_bit_cnt[1:0];
  end else begin
    the_next_to_scan_word_starts_in_bus = 1'b0;
    start_of_next_to_scan_word_in_bus = 2'b0;
    next_to_scan_word_bits_in_bus = 2'b0;
  end
end
 
// Calling tasks from combinational block below is intended.
// spyglass disable_block W428
always @ (*) begin
  drive_bus_out                                             = 2'b0;
  if (have_in_bits_in_remaining_bus_words) begin
    // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
    // spyglass disable_block W362 STARC05-2.10.3.1
    if (the_next_to_scan_word_starts_in_bus && (start_of_next_to_scan_word_in_bus < in_bits_in_remaining_bus_words) && start_of_next_to_scan_word_in_bus != 2'b0) begin
    // spyglass enable_block W362 STARC05-2.10.3.1
      drive_bus_out_task (
        received_in_bit_cnt,                                                                                              // received_so_far
        0,                                                                                                                // start_bus_position
        start_of_next_to_scan_word_in_bus,                                                                                // bus_bit_num
        drive_out_packets                                                                                                 // enable_condition
      );
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (in_bits_in_remaining_bus_words < bus_width) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        // This is guarded in previous if statement so there won't be truncation
        // spyglass disable_block W116
        drive_bus_out_task (
          0,                                                                                                              // received_so_far
          start_of_next_to_scan_word_in_bus,                                                                              // start_bus_position
          in_bits_in_remaining_bus_words-start_of_next_to_scan_word_in_bus,                                               // bus_bit_num
          (state==shift_enum) || drive_out_packets                                                                        // enable_condition
        );
        // spyglass enable_block W116
      end else begin
        drive_bus_out_task (
          0,                                                                                                              // received_so_far
          start_of_next_to_scan_word_in_bus,                                                                              // start_bus_position
          bus_width-start_of_next_to_scan_word_in_bus,                                                                    // bus_bit_num
          (state==shift_enum) || drive_out_packets                                                                        // enable_condition
        );
      end
      if (start_of_packet) begin
        // This is guarded in previous if statement so there won't be truncation
        // spyglass disable_block W116
        drive_bus_out_task (
          in_bits_in_remaining_bus_words-start_of_next_to_scan_word_in_bus,                                               // received_so_far
          in_bit0_position_in_first_bus_word,                                                                             // start_bus_position
          in_bits_in_first_bus_word,                                                                                      // bus_bit_num
          (state==shift_enum) || drive_out_packets                                                                        // enable_condition
        );
        // spyglass enable_block W116
      end
    end else begin
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (in_bits_in_remaining_bus_words < bus_width) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        drive_bus_out_task (
          received_in_bit_cnt,                                                                                            // received_so_far
          0,                                                                                                              // start_bus_position
          in_bits_in_remaining_bus_words,                                                                                 // bus_bit_num
          drive_out_packets                                                                                               // enable_condition
        );
      end else begin
        drive_bus_out_task (
          received_in_bit_cnt,                                                                                            // received_so_far
          0,                                                                                                              // start_bus_position
          bus_width,                                                                                                      // bus_bit_num
          drive_out_packets                                                                                               // enable_condition
        );
      end
      if (start_of_packet) begin
        if (the_next_to_scan_word_starts_in_bus && start_of_next_to_scan_word_in_bus > in_bit0_position_in_first_bus_word) begin
          drive_bus_out_task (
            received_in_bit_cnt_plus_in_bits_in_remaining_bus_words,                                                      // received_so_far
            in_bit0_position_in_first_bus_word,                                                                           // start_bus_position
            start_of_next_to_scan_word_in_bus-in_bit0_position_in_first_bus_word,                                         // bus_bit_num
            drive_out_packets                                                                                             // enable_condition
          );
          drive_bus_out_task (
            0,                                                                                                            // received_so_far
            start_of_next_to_scan_word_in_bus,                                                                            // start_bus_position
            in_bit0_position_in_first_bus_word+in_bits_in_first_bus_word-start_of_next_to_scan_word_in_bus,               // bus_bit_num
            (state==shift_enum) || (drive_out_packets && next_drive_out_packets)                                          // enable_condition
          );
        end else begin
          if (the_next_to_scan_word_starts_in_bus && start_of_next_to_scan_word_in_bus == in_bit0_position_in_first_bus_word) begin
            drive_bus_out_task (
              0,                                                                                                          // received_so_far
              in_bit0_position_in_first_bus_word,                                                                         // start_bus_position
              in_bits_in_first_bus_word,                                                                                  // bus_bit_num
              (state==shift_enum) || (drive_out_packets && next_drive_out_packets)                                        // enable_condition
            );
          end else begin
            drive_bus_out_task (
              received_in_bit_cnt_plus_in_bits_in_remaining_bus_words,                                                    // received_so_far
              in_bit0_position_in_first_bus_word,                                                                         // start_bus_position
              in_bits_in_first_bus_word,                                                                                  // bus_bit_num
              drive_out_packets                                                                                           // enable_condition
            );
          end
        end
      end
    end
  end else begin
    if (start_of_packet) begin
      if (the_next_to_scan_word_starts_in_bus && start_of_next_to_scan_word_in_bus != in_bit0_position_in_first_bus_word) begin
        drive_bus_out_task (
          received_in_bit_cnt,                                                                                            // received_so_far
          in_bit0_position_in_first_bus_word,                                                                             // start_bus_position
          start_of_next_to_scan_word_in_bus-in_bit0_position_in_first_bus_word,                                           // bus_bit_num
          drive_out_packets                                                                                               // enable_condition
        );
        drive_bus_out_task (
          0,                                                                                                              // received_so_far
          start_of_next_to_scan_word_in_bus,                                                                              // start_bus_position
          in_bit0_position_in_first_bus_word+in_bits_in_first_bus_word-start_of_next_to_scan_word_in_bus,                 // bus_bit_num
          (state==shift_enum) || (drive_out_packets && next_drive_out_packets)                                            // enable_condition
        );
      end else begin
        drive_bus_out_task (
          received_in_bit_cnt,                                                                                            // received_so_far
          in_bit0_position_in_first_bus_word,                                                                             // start_bus_position
          in_bits_in_first_bus_word,                                                                                      // bus_bit_num
          drive_out_packets                                                                                               // enable_condition
        );
      end
    end
  end
end
// spyglass enable_block W428
 
// synopsys sync_set_reset "enable_sync"
always @ (posedge clock) begin
  if (~enable_sync) begin
    received_in_bit_cnt <= 7'b0;
  end else begin
    if (~ready_for_packets) begin
      received_in_bit_cnt <= 7'b0;
    end else begin
      received_in_bit_cnt <= next_received_in_bit_cnt;
    end
  end
end
 
// Comparison is correct so W362 and STARC05-2.10.3.1 can be waived. There won't be borrow condition because it is start of the packet and in_bit0_position_in_first_bus_word won't be greater than bus_width
// spyglass disable_block W362 STARC05-2.10.3.1 W484 STARC-2.10.6.1
assign in_bits_in_first_bus_word = (start_of_packet)
                                     ? (in_bit0_position_in_first_bus_word_plus_bits_per_packet > bus_width)
                                       ? bus_width-in_bit0_position_in_first_bus_word
                                       : bits_per_packet[1:0]
                                     : 2'b0;
// spyglass enable_block W362 STARC05-2.10.3.1 W484 STARC-2.10.6.1
 
assign have_in_bits_in_remaining_bus_words = (in_bits_in_remaining_bus_words != 6'b0);
 
// Global variables are used only in one always block. By using this construction tool could keep variable values from the always block and don't override it by values from the task when not needed.
// spyglass disable_block W426
task automatic drive_bus_out_task;
  input reg [6:0]     received_so_far;
  input reg [1:0]     start_bus_position;
  input reg [6:0]     bus_bit_num;
  input reg           enable_condition;
 
  reg   [1:0]         local_cnt;
 
  begin
    // local_cnt is used not only as an intex loop but also in comparisons. This is intended.
    // spyglass disable_block W480
    for (local_cnt=0;local_cnt<2;local_cnt=local_cnt+1) begin
    // spyglass enable_block W480
      // Comparison is correct so W362 and STARC05-2.10.3.1 can be waived
      // spyglass disable_block W362 STARC05-2.10.3.1
      if (local_cnt>=start_bus_position && local_cnt<start_bus_position+bus_bit_num) begin
      // spyglass enable_block W362 STARC05-2.10.3.1
        drive_bus_out[local_cnt] = enable_condition;
      end
    end
  end
 
endtask
// spyglass enable_block W426
 
endmodule
  
module processor_core_logic_test_tessent_ssn_scan_host_1_ijtag_registers (
  input wire             ijtag_reset,
  input wire             ijtag_clock,
  input wire             ijtag_sel,
  input wire             ijtag_ce,
  input wire             ijtag_se,
  input wire             ijtag_ue,
  input wire             ijtag_si,
  output wire            ijtag_so,
  output reg             enable,
  input wire             enable_sync,
  output wire [30:0]     initial_offset,
  output wire            relative_initial_offset_enable,
  output wire [1:0]      bus_width,
  output wire [5:0]      bits_per_packet,
  output wire [5:0]      to_scan_in_bits,
  output wire [5:0]      from_scan_out_bits,
  output wire [27:0]     total_shift_cnt_minus_one,
  output wire [27:0]     extra_shift_packets,
  output wire [15:0]     packet_size,
  output wire [2:0]      timeslot_sharing_count_minus_one,
  output wire [2:0]      timeslot_sharing_offset,
  output wire            force_suppress_capture,
  output wire [1:0]      initial_bit0_position,
  output wire            loop_back_en,
  output wire            streaming_through_ijtag_en,
  input wire             bus_data_out0,
  output wire            bus_register_ijtag_access_en,
  output wire [2:0]      capture_packets,
  output wire            init_scan_load_used,
  output wire            disable_first_scan_load_masking,
  output wire [2:0]      packets_per_capture_clock_minus_one,
  output wire [6:0]      scan_en_transition_packets,
  output wire [6:0]      scan_en_launch_packet,
  output wire [6:0]      edt_update_falling_transition_words,
  output wire [6:0]      edt_update_falling_launch_word,
  output wire [5:0]      min_shift_clock_low_width,
  output wire [5:0]      min_capture_clock_low_width,
  output wire            packet_width_is_less_than_two_bus_clock,
  output wire            infinite_shift_mode
);
 
// Reg and wire declarations
reg                      enable_update_stage, enable_shift_reg;
reg                      config_sib, config_sib_shift_reg;
reg                      streaming_through_ijtag_en_shift_reg;
reg                      streaming_through_ijtag_en_update_stage;
reg    [30:0]            initial_offset_shift_reg;
reg                      relative_initial_offset_enable_shift_reg;
reg    [1:0]             bus_width_shift_reg;
reg    [5:0]             bits_per_packet_shift_reg;
reg    [5:0]             to_scan_in_bits_shift_reg;
reg    [5:0]             from_scan_out_bits_shift_reg;
reg    [27:0]            total_shift_cnt_minus_one_shift_reg;
reg    [27:0]            extra_shift_packets_shift_reg;
reg    [15:0]            packet_size_shift_reg;
reg    [2:0]             timeslot_sharing_count_minus_one_shift_reg;
reg    [2:0]             timeslot_sharing_offset_shift_reg;
reg                      force_suppress_capture_shift_reg;
reg    [1:0]             initial_bit0_position_shift_reg;
reg                      loop_back_en_shift_reg;
reg    [2:0]             capture_packets_shift_reg;
reg                      init_scan_load_used_shift_reg;
reg                      disable_first_scan_load_masking_shift_reg;
reg    [2:0]             packets_per_capture_clock_minus_one_shift_reg;
reg    [6:0]             scan_en_transition_packets_shift_reg;
reg    [6:0]             scan_en_launch_packet_shift_reg;
reg    [6:0]             edt_update_falling_transition_words_shift_reg;
reg    [6:0]             edt_update_falling_launch_word_shift_reg;
reg    [5:0]             min_shift_clock_low_width_shift_reg;
reg    [5:0]             min_capture_clock_low_width_shift_reg;
reg                      packet_width_is_less_than_two_bus_clock_shift_reg;
reg                      bus_data_out0_retime;
reg                      so_retime;
wire                     reset;
wire   [27:0]            extra_shift_packets_int;
// Body implementation
assign infinite_shift_mode = (total_shift_cnt_minus_one == 28'b0);
// IJTAG by protocol is operating on both clock edges so no violation here.
// spyglass disable_block W391
always @ (posedge ijtag_clock) begin
  if (ijtag_sel && !streaming_through_ijtag_en) begin
    if (ijtag_se) begin
      if (bus_register_ijtag_access_en) begin
        config_sib_shift_reg                                      <= bus_data_out0_retime;
      end else begin
        config_sib_shift_reg                                      <= ijtag_si;
      end
      enable_shift_reg                                            <= config_sib_shift_reg;
      if (config_sib & ~enable_update_stage) begin
        streaming_through_ijtag_en_shift_reg                      <= enable_shift_reg;
        initial_offset_shift_reg                                  <= {streaming_through_ijtag_en_shift_reg,
                                                                      initial_offset_shift_reg[30:1]};
        relative_initial_offset_enable_shift_reg                  <= initial_offset_shift_reg[0];
        bus_width_shift_reg                                       <= {relative_initial_offset_enable_shift_reg,
                                                                      bus_width_shift_reg[1:1]};
        bits_per_packet_shift_reg                                 <= {bus_width_shift_reg[0],
                                                                      bits_per_packet_shift_reg[5:1]};
        to_scan_in_bits_shift_reg                                 <= {bits_per_packet_shift_reg[0],
                                                                      to_scan_in_bits_shift_reg[5:1]};
        from_scan_out_bits_shift_reg                              <= {to_scan_in_bits_shift_reg[0],
                                                                      from_scan_out_bits_shift_reg[5:1]};
        total_shift_cnt_minus_one_shift_reg                       <= {from_scan_out_bits_shift_reg[0],
                                                                      total_shift_cnt_minus_one_shift_reg[27:1]};
        extra_shift_packets_shift_reg                             <= {total_shift_cnt_minus_one_shift_reg[0],
                                                                      extra_shift_packets_shift_reg[27:1]};
        packet_size_shift_reg                                     <= {extra_shift_packets_shift_reg[0],
                                                                      packet_size_shift_reg[15:1]};
        timeslot_sharing_count_minus_one_shift_reg                <= {packet_size_shift_reg[0],
                                                                      timeslot_sharing_count_minus_one_shift_reg[2:1]};
        timeslot_sharing_offset_shift_reg                         <= {timeslot_sharing_count_minus_one_shift_reg[0],
                                                                      timeslot_sharing_offset_shift_reg[2:1]};
        force_suppress_capture_shift_reg                          <= timeslot_sharing_offset_shift_reg[0];
        initial_bit0_position_shift_reg                           <= {force_suppress_capture_shift_reg,
                                                                      initial_bit0_position_shift_reg[1:1]};
        loop_back_en_shift_reg                                    <= initial_bit0_position_shift_reg[0];
        capture_packets_shift_reg                                 <= {loop_back_en_shift_reg,
                                                                      capture_packets_shift_reg[2:1]};
        init_scan_load_used_shift_reg                             <= capture_packets_shift_reg[0];
        disable_first_scan_load_masking_shift_reg                 <= init_scan_load_used_shift_reg;
        packets_per_capture_clock_minus_one_shift_reg             <= {disable_first_scan_load_masking_shift_reg,
                                                                      packets_per_capture_clock_minus_one_shift_reg[2:1]};
        scan_en_transition_packets_shift_reg                      <= {packets_per_capture_clock_minus_one_shift_reg[0],
                                                                      scan_en_transition_packets_shift_reg[6:1]};
        scan_en_launch_packet_shift_reg                           <= {scan_en_transition_packets_shift_reg[0],
                                                                      scan_en_launch_packet_shift_reg[6:1]};
        edt_update_falling_transition_words_shift_reg             <= {scan_en_launch_packet_shift_reg[0],
                                                                      edt_update_falling_transition_words_shift_reg[6:1]};
        edt_update_falling_launch_word_shift_reg                  <= {edt_update_falling_transition_words_shift_reg[0],
                                                                      edt_update_falling_launch_word_shift_reg[6:1]};
        min_shift_clock_low_width_shift_reg                       <= {edt_update_falling_launch_word_shift_reg[0],
                                                                      min_shift_clock_low_width_shift_reg[5:1]};
        min_capture_clock_low_width_shift_reg                     <= {min_shift_clock_low_width_shift_reg[0],
                                                                      min_capture_clock_low_width_shift_reg[5:1]};
        packet_width_is_less_than_two_bus_clock_shift_reg         <= min_capture_clock_low_width_shift_reg[0];
      end
    end else if (ijtag_ce) begin
      enable_shift_reg                                            <= enable_update_stage;
      if (config_sib) begin
        streaming_through_ijtag_en_shift_reg                      <= streaming_through_ijtag_en_update_stage;
      end
    end
  end
end
// spyglass enable_block W391
assign reset = ~ijtag_reset;
always @ (negedge ijtag_clock or posedge reset) begin
  if (reset) begin
    enable_update_stage                                           <= 1'b0;
    config_sib                                                    <= 1'b0;
    streaming_through_ijtag_en_update_stage                       <= 1'b0;
    enable                                                        <= 1'b0;
  end else if (ijtag_sel && ijtag_ue) begin
    enable_update_stage                                           <= enable_shift_reg && !streaming_through_ijtag_en;
    config_sib                                                    <= config_sib_shift_reg;
    if (config_sib) begin
      streaming_through_ijtag_en_update_stage                     <= streaming_through_ijtag_en_shift_reg;
    end
    enable                                                        <= ~config_sib_shift_reg & enable_shift_reg;
  end
end
 
always @ (negedge ijtag_clock) begin
  if (streaming_through_ijtag_en) begin
    so_retime <= bus_data_out0  && enable_sync;
  end else begin
    if (config_sib && ~enable_update_stage) begin
      so_retime <= packet_width_is_less_than_two_bus_clock_shift_reg;
    end else begin
      so_retime <= enable_shift_reg;
    end
  end
  bus_data_out0_retime <= bus_data_out0;
end
  
assign streaming_through_ijtag_en                 = streaming_through_ijtag_en_update_stage && enable_update_stage;
assign bus_register_ijtag_access_en               = config_sib && enable_update_stage;
assign initial_offset                             = initial_offset_shift_reg;
assign relative_initial_offset_enable             = relative_initial_offset_enable_shift_reg;
assign bus_width                                  = bus_width_shift_reg;
assign bits_per_packet                            = bits_per_packet_shift_reg;
assign to_scan_in_bits                            = to_scan_in_bits_shift_reg;
assign from_scan_out_bits                         = from_scan_out_bits_shift_reg;
assign total_shift_cnt_minus_one                  = total_shift_cnt_minus_one_shift_reg;
assign extra_shift_packets_int                    = extra_shift_packets_shift_reg;
assign packet_size                                = packet_size_shift_reg;
assign timeslot_sharing_count_minus_one           = timeslot_sharing_count_minus_one_shift_reg;
assign timeslot_sharing_offset                    = timeslot_sharing_offset_shift_reg;
assign force_suppress_capture                     = force_suppress_capture_shift_reg;
assign initial_bit0_position                      = initial_bit0_position_shift_reg;
assign loop_back_en                               = loop_back_en_shift_reg;
assign capture_packets                            = capture_packets_shift_reg;
assign init_scan_load_used                        = init_scan_load_used_shift_reg;
assign disable_first_scan_load_masking            = disable_first_scan_load_masking_shift_reg;
assign packets_per_capture_clock_minus_one        = packets_per_capture_clock_minus_one_shift_reg;
assign scan_en_transition_packets                 = scan_en_transition_packets_shift_reg;
assign scan_en_launch_packet                      = scan_en_launch_packet_shift_reg;
assign edt_update_falling_transition_words        = edt_update_falling_transition_words_shift_reg;
assign edt_update_falling_launch_word             = edt_update_falling_launch_word_shift_reg;
assign min_shift_clock_low_width                  = min_shift_clock_low_width_shift_reg;
assign min_capture_clock_low_width                = min_capture_clock_low_width_shift_reg;
assign packet_width_is_less_than_two_bus_clock    = packet_width_is_less_than_two_bus_clock_shift_reg;
assign ijtag_so                                   = so_retime;
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_27 (
  .A                                    ( extra_shift_packets_int[27]            ),
  .Y                                    ( extra_shift_packets[27]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_26 (
  .A                                    ( extra_shift_packets_int[26]            ),
  .Y                                    ( extra_shift_packets[26]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_25 (
  .A                                    ( extra_shift_packets_int[25]            ),
  .Y                                    ( extra_shift_packets[25]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_24 (
  .A                                    ( extra_shift_packets_int[24]            ),
  .Y                                    ( extra_shift_packets[24]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_23 (
  .A                                    ( extra_shift_packets_int[23]            ),
  .Y                                    ( extra_shift_packets[23]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_22 (
  .A                                    ( extra_shift_packets_int[22]            ),
  .Y                                    ( extra_shift_packets[22]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_21 (
  .A                                    ( extra_shift_packets_int[21]            ),
  .Y                                    ( extra_shift_packets[21]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_20 (
  .A                                    ( extra_shift_packets_int[20]            ),
  .Y                                    ( extra_shift_packets[20]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_19 (
  .A                                    ( extra_shift_packets_int[19]            ),
  .Y                                    ( extra_shift_packets[19]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_18 (
  .A                                    ( extra_shift_packets_int[18]            ),
  .Y                                    ( extra_shift_packets[18]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_17 (
  .A                                    ( extra_shift_packets_int[17]            ),
  .Y                                    ( extra_shift_packets[17]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_16 (
  .A                                    ( extra_shift_packets_int[16]            ),
  .Y                                    ( extra_shift_packets[16]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_15 (
  .A                                    ( extra_shift_packets_int[15]            ),
  .Y                                    ( extra_shift_packets[15]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_14 (
  .A                                    ( extra_shift_packets_int[14]            ),
  .Y                                    ( extra_shift_packets[14]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_13 (
  .A                                    ( extra_shift_packets_int[13]            ),
  .Y                                    ( extra_shift_packets[13]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_12 (
  .A                                    ( extra_shift_packets_int[12]            ),
  .Y                                    ( extra_shift_packets[12]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_11 (
  .A                                    ( extra_shift_packets_int[11]            ),
  .Y                                    ( extra_shift_packets[11]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_10 (
  .A                                    ( extra_shift_packets_int[10]            ),
  .Y                                    ( extra_shift_packets[10]                )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_9 (
  .A                                    ( extra_shift_packets_int[9]             ),
  .Y                                    ( extra_shift_packets[9]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_8 (
  .A                                    ( extra_shift_packets_int[8]             ),
  .Y                                    ( extra_shift_packets[8]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_7 (
  .A                                    ( extra_shift_packets_int[7]             ),
  .Y                                    ( extra_shift_packets[7]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_6 (
  .A                                    ( extra_shift_packets_int[6]             ),
  .Y                                    ( extra_shift_packets[6]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_5 (
  .A                                    ( extra_shift_packets_int[5]             ),
  .Y                                    ( extra_shift_packets[5]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_4 (
  .A                                    ( extra_shift_packets_int[4]             ),
  .Y                                    ( extra_shift_packets[4]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_3 (
  .A                                    ( extra_shift_packets_int[3]             ),
  .Y                                    ( extra_shift_packets[3]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_2 (
  .A                                    ( extra_shift_packets_int[2]             ),
  .Y                                    ( extra_shift_packets[2]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_1 (
  .A                                    ( extra_shift_packets_int[1]             ),
  .Y                                    ( extra_shift_packets[1]                 )
);
 
buf02 tessent_persistent_cell_extra_shift_packets_buf_0 (
  .A                                    ( extra_shift_packets_int[0]             ),
  .Y                                    ( extra_shift_packets[0]                 )
);
 
endmodule
 
module processor_core_logic_test_tessent_ssn_scan_host_1_clock_gen (
  input wire             clock,
  input wire             enable,
  input wire             enable_sync,
  input wire             loop_back_en,
  input wire             ready_to_shift,
  input wire             ready_to_capture,
  input wire             ext_capture_mode,
  input wire             pulse_width_packet_cnt_is_zero,
  input wire             edt_update_in,
  input wire             edt_clock_en_in,
  input wire             scan_en_in,
  input wire             last_in_bits_in_current_bus_word,
  input wire             last_scan_load_is_done,
  input wire  [5:0]      min_shift_clock_low_width,
  input wire  [5:0]      min_capture_clock_low_width,
  output wire            min_capture_clock_low_width_is_zero,
  input wire             packet_width_is_less_than_two_bus_clock,
  input wire  [2:0]      packets_per_capture_clock_minus_one,
  input wire  [27:0]     extra_shift_packets,
  input wire             scan_en_launch_packet_equal_transition_packets,
  input wire             select_capture_clock_low_width,
  input wire             inject_tck_as_capture_clock,
  input wire             ijtag_clock,
  output wire            test_clock,
  output wire            scan_en,
  output wire            edt_update,
  output wire            use_div_shift_clocks,
  output wire            shift_clock_en,
  output wire            min_shift_clock_low_width_is_zero
);
 
// Reg and wire declarations
 
wire                     edt_clock_en;
reg    [5:0]             clock_low_cnt, next_clock_low_cnt;
reg                      test_clock_div;
reg                      next_test_clock_div;
wire                     test_clock_div_buf;
wire                     test_clock_en_not_for_div, test_clock_en_for_div;
reg                      edt_update_ret;
reg                      scan_en_delayed, edt_update_delayed, ready_to_shift_delayed, ready_to_capture_delayed;
reg                      edt_clock_en_in_delayed;
wire                     edt_clock_en_not_for_div, edt_clock_en_for_div;
reg                      pulse_width_packet_cnt_is_zero_delayed;
wire                     shift_clock_en_for_div;
wire                     capture_clock_en_for_div, capture_clock_en_not_for_div, shift_capture_clock_en_not_for_div;
wire                     shift_capture_clock_en_for_div;
wire                     packets_per_capture_clock_minus_one_is_zero = (packets_per_capture_clock_minus_one == 3'b0);
wire                     short_packet_with_wide_capture = ~packets_per_capture_clock_minus_one_is_zero;
wire                     ready_to_capture_selected                = (short_packet_with_wide_capture) ? ready_to_capture : ready_to_capture_delayed;
wire                     pulse_width_packet_cnt_is_zero_selected  = (short_packet_with_wide_capture) ? pulse_width_packet_cnt_is_zero : pulse_width_packet_cnt_is_zero_delayed;
// Body implementation
 
assign min_shift_clock_low_width_is_zero    = (min_shift_clock_low_width   == 6'b0);
assign min_capture_clock_low_width_is_zero  = (min_capture_clock_low_width == 6'b0);
assign edt_clock_en                         = enable_sync & ((edt_clock_en_in && last_in_bits_in_current_bus_word) || shift_clock_en) && ~last_scan_load_is_done;
assign edt_clock_en_for_div                 = (enable_sync & ((edt_update_delayed && ~edt_clock_en_in && last_in_bits_in_current_bus_word) || shift_clock_en_for_div)) || last_scan_load_is_done;
assign edt_clock_en_not_for_div             = edt_clock_en && min_shift_clock_low_width_is_zero;
assign shift_clock_en                       = enable_sync & (scan_en && last_in_bits_in_current_bus_word && ready_to_shift);
assign shift_clock_en_for_div               = (last_in_bits_in_current_bus_word && ready_to_shift_delayed);
assign capture_clock_en_for_div             = (ready_to_capture_selected  && last_in_bits_in_current_bus_word && pulse_width_packet_cnt_is_zero_selected);
assign capture_clock_en_not_for_div         = ready_to_capture           && last_in_bits_in_current_bus_word && pulse_width_packet_cnt_is_zero;
assign shift_capture_clock_en_for_div       = enable_sync & ((capture_clock_en_for_div     && !min_capture_clock_low_width_is_zero) || 
                                                             (shift_clock_en_for_div       && !min_shift_clock_low_width_is_zero));
assign shift_capture_clock_en_not_for_div   = enable_sync & ((capture_clock_en_not_for_div && min_capture_clock_low_width_is_zero) ||
                                                             (shift_clock_en               && min_shift_clock_low_width_is_zero));
assign test_clock_en_not_for_div            = shift_capture_clock_en_not_for_div || edt_clock_en_not_for_div;
assign test_clock_en_for_div                = shift_capture_clock_en_for_div     || edt_clock_en_for_div;
always @ (*) begin
  if (last_in_bits_in_current_bus_word && (~select_capture_clock_low_width || pulse_width_packet_cnt_is_zero)) begin
    if (select_capture_clock_low_width) begin
      next_clock_low_cnt = min_capture_clock_low_width;
    end else begin
      next_clock_low_cnt = min_shift_clock_low_width;
    end
  end else begin
    if (clock_low_cnt != 6'b0) begin
      next_clock_low_cnt = clock_low_cnt - 6'b1;
    end else begin
      next_clock_low_cnt = clock_low_cnt;
    end
  end
end
 
// synopsys sync_set_reset "enable_sync"
always @ (posedge clock) begin
  if (~enable_sync) begin
    ready_to_capture_delayed <= 1'b0;
    ready_to_shift_delayed <= 1'b0;
    edt_clock_en_in_delayed <= 1'b0;
    scan_en_delayed <= 1'b1;
    pulse_width_packet_cnt_is_zero_delayed <= 1'b1;
  end else begin
    if (last_in_bits_in_current_bus_word) begin
      ready_to_capture_delayed <= ready_to_capture;
      ready_to_shift_delayed   <= ready_to_shift;
      edt_clock_en_in_delayed  <= edt_clock_en_in;
      pulse_width_packet_cnt_is_zero_delayed <= pulse_width_packet_cnt_is_zero;
    end
    if (clock_low_cnt == 6'b1) begin
      scan_en_delayed <= scan_en_in;
    end
  end
end
always @ (posedge clock or negedge enable_sync) begin
  // This async usage is due to initialize signal before usage in EDT controller
  // spyglass disable_block STARC05-1.3.1.3
  if (~enable_sync) begin
  // spyglass enable_block STARC05-1.3.1.3
    edt_update_delayed <= 1'b1;
  end else begin
    if (last_in_bits_in_current_bus_word) begin
      edt_update_delayed <= edt_update_in;
    end
  end
end
 
always @ (*) begin
  next_test_clock_div           = test_clock_div_buf;
  if ((min_shift_clock_low_width_is_zero && ready_to_shift) || 
      (min_capture_clock_low_width_is_zero && ready_to_capture)) begin
    next_test_clock_div = 1'b0;
  end else begin
    if (test_clock_en_for_div) begin
      next_test_clock_div = 1'b0;
    end else if (clock_low_cnt == 6'b1 && (ready_to_shift_delayed || edt_clock_en_in_delayed || ready_to_capture_selected) && ~loop_back_en) begin
      next_test_clock_div = 1'b1;
    end
  end
end
 
always @ (posedge clock or negedge enable_sync) begin
  // This async usage is due to prevent glitches
  // spyglass disable_block STARC05-1.3.1.3
  if (~enable_sync) begin
  // spyglass enable_block STARC05-1.3.1.3
    test_clock_div            <= 1'b0;
  end else begin
    test_clock_div            <= next_test_clock_div;
  end
end
 
buf02 tessent_persistent_cell_test_clock_div_buf (
  .A                ( test_clock_div              ),
  .Y                ( test_clock_div_buf          )
);
 
// processor_core_logic_test_tessent_ssn_scan_host_1_clock_gen module uses both edges of the clock. Negedge clock is used in retiming flops.
// Gated reset signal usage is intended, reset signal is generated based on multiple signals
// spyglass disable_block W391 STARC05-1.3.2.1a
always @ (posedge clock or negedge enable_sync) begin
  // This async usage is due to prevent glitches
  // spyglass disable_block STARC05-1.3.1.3
  if (~enable_sync) begin
  // spyglass enable_block STARC05-1.3.1.3
    clock_low_cnt <= 6'b0;
  end else begin
    if ((min_shift_clock_low_width_is_zero && ready_to_shift) ||
        (min_capture_clock_low_width_is_zero && ready_to_capture)) begin
      clock_low_cnt <= 6'b0;
    end else begin
      clock_low_cnt <= next_clock_low_cnt;
    end
  end
end
// spyglass enable_block W391 STARC05-1.3.2.1a
 
 
// Gated set signal usage is intended, reset signal is generated based on multiple signals
// spyglass disable_block STARC05-1.3.2.1a
always @ (negedge clock or negedge enable_sync) begin
  // This async usage is due to initialize signal before usage in EDT controller
  // spyglass disable_block STARC05-1.3.1.3
  if (~enable_sync) begin
  // spyglass enable_block STARC05-1.3.1.3
    edt_update_ret <= 1'b1;
  end else begin
    edt_update_ret <= edt_update_in || ~min_shift_clock_low_width_is_zero;
  end
end
// spyglass enable_block STARC05-1.3.2.1a
wire extra_shift_packets_is_zero = (extra_shift_packets == 28'b0);
mux21 tessent_persistent_cell_edt_update_mux (
  .Y      ( edt_update                                  ),
  .S0     ( min_shift_clock_low_width_is_zero           ),
  .A0     ( edt_update_delayed & enable_sync            ),
  .A1     ( edt_update_ret & enable_sync                )
);
 
assign scan_en    = (((min_shift_clock_low_width_is_zero || packet_width_is_less_than_two_bus_clock) && ~extra_shift_packets_is_zero) || 
                     ((min_shift_clock_low_width_is_zero || 
                      (packet_width_is_less_than_two_bus_clock && ~scan_en_launch_packet_equal_transition_packets))  &&  extra_shift_packets_is_zero) ||
                     ext_capture_mode ||
                     ~packets_per_capture_clock_minus_one_is_zero)
                    ? scan_en_in & enable_sync 
                    : scan_en_delayed & enable_sync;
 
assign use_div_shift_clocks    = enable_sync & !min_shift_clock_low_width_is_zero;
 
processor_core_logic_test_tessent_ssn_scan_host_1_clock_signals clock_signals (
  .clock                                                                    ( clock                                                                   ),
  .enable                                                                   ( enable                                                                  ),
  .ijtag_clock_cg_en                                                        ( inject_tck_as_capture_clock                                             ),
  .ijtag_clock                                                              ( ijtag_clock                                                             ),
  .next_test_clock_div                                                      ( next_test_clock_div                                                     ),
  .test_clock_cg_en                                                         ( (test_clock_en_not_for_div && ~loop_back_en)                            ),
  .test_clock                                                               ( test_clock                                                              ));
 
endmodule
 
module processor_core_logic_test_tessent_ssn_scan_host_1_datapath_shifters (
  input wire  [1:0]      bus_register_in,
  output wire [1:0]      bus_register_shifted_down_next_to_scan_in_word,
  output wire [32:1]     bus_register_shifted_up_current_to_scan_in_word_in_current_packet,
  output wire [32:1]     bus_register_shifted_up_current_to_scan_in_word_in_next_packet,
  input wire  [5:0]      in_bits_in_remaining_bus_words_minus_start_of_next_to_scan_word_in_bus,
  output wire [1:1]      bus_register_shifted_up_next_to_scan_in_word_in_next_packet,
  input wire  [32:0]     from_scan_out_storage,
  output wire [1:0]      from_scan_out_storage_shifted_down_current_word_current_packet,
  output wire [1:0]      from_scan_out_current_word_shifted_up_next_packet,
  input wire  [1:0]      in_bit0_position_in_first_bus_word_minus_bits_for_current_word,
  input wire  [32:0]     from_scan_out_source,
  output wire [1:1]      from_scan_out_next_word_shifted_up,
  output wire [1:1]      from_scan_out_next_word_shifted_up_next_packet,
 
 
  input wire  [1:0]      in_bit0_position_in_first_bus_word,
  input wire  [6:0]      received_in_bit_cnt,
  input wire  [6:0]      received_in_bit_cnt_plus_in_bits_in_remaining_bus_words,
  input wire  [1:0]      start_of_next_to_scan_word_in_bus
);
 
wire [1:0]               bus_register_shifted_down_current_to_scan_in_word;
// Bits [0] are not used for the following variables
// spyglass disable_block W498
wire [32:0]              bus_register_shifted_up_current_to_scan_in_word_in_current_packet_internal;
wire [32:0]              bus_register_shifted_up_current_to_scan_in_word_in_next_packet_internal;
wire [1:0]               bus_register_shifted_up_next_to_scan_in_word_in_next_packet_internal;
// spyglass enable_block W498
wire [32:0]              from_scan_out_storage_shifted_down_current_word_next_packet;
// Bits [0] are not used for the following variables
// spyglass disable_block W498
wire [1:0]               from_scan_out_next_word_shifted_up_internal;
wire [1:0]               from_scan_out_next_word_shifted_up_next_packet_internal;
// spyglass enable_block W498
 
// Implicit truncations to place starting bit in proper place.
// spyglass disable_block W486 W164a W164b
assign bus_register_shifted_down_next_to_scan_in_word                             = bus_register_in                                   >> start_of_next_to_scan_word_in_bus;
assign bus_register_shifted_down_current_to_scan_in_word                          = bus_register_in                                   >> in_bit0_position_in_first_bus_word;
assign bus_register_shifted_up_current_to_scan_in_word_in_current_packet_internal = bus_register_in                                   << received_in_bit_cnt[6:0];
assign bus_register_shifted_up_current_to_scan_in_word_in_next_packet_internal    = bus_register_shifted_down_current_to_scan_in_word << (received_in_bit_cnt_plus_in_bits_in_remaining_bus_words);
assign bus_register_shifted_up_next_to_scan_in_word_in_next_packet_internal       = bus_register_shifted_down_current_to_scan_in_word << (in_bits_in_remaining_bus_words_minus_start_of_next_to_scan_word_in_bus);
assign bus_register_shifted_up_current_to_scan_in_word_in_current_packet          = bus_register_shifted_up_current_to_scan_in_word_in_current_packet_internal[32:1];
assign bus_register_shifted_up_current_to_scan_in_word_in_next_packet             = bus_register_shifted_up_current_to_scan_in_word_in_next_packet_internal[32:1];
assign bus_register_shifted_up_next_to_scan_in_word_in_next_packet                = bus_register_shifted_up_next_to_scan_in_word_in_next_packet_internal[1:1];
// spyglass enable_block W486 W164a W164b
 
// Shifted values are used when drive_bus_out_gated is enabled so no risk to capture wrong value from shift registers.
// spyglass disable_block W486 W164a W164b
assign from_scan_out_storage_shifted_down_current_word_current_packet = from_scan_out_storage                                       >> received_in_bit_cnt;
assign from_scan_out_storage_shifted_down_current_word_next_packet    = from_scan_out_storage[32:0]                                 >> received_in_bit_cnt_plus_in_bits_in_remaining_bus_words;
assign from_scan_out_current_word_shifted_up_next_packet              = from_scan_out_storage_shifted_down_current_word_next_packet << in_bit0_position_in_first_bus_word;
assign from_scan_out_next_word_shifted_up_internal                    = from_scan_out_source                                        << start_of_next_to_scan_word_in_bus;
assign from_scan_out_next_word_shifted_up_next_packet_internal        = from_scan_out_source                                        << in_bit0_position_in_first_bus_word_minus_bits_for_current_word;
 
assign from_scan_out_next_word_shifted_up                             = from_scan_out_next_word_shifted_up_internal[1:1];
assign from_scan_out_next_word_shifted_up_next_packet                 = from_scan_out_next_word_shifted_up_next_packet_internal[1:1];
// spyglass enable_block W486 W164a W164b
endmodule
 
module processor_core_logic_test_tessent_ssn_scan_host_1_clock_signals (
  input wire             clock,
  input wire             enable,
  input wire             ijtag_clock_cg_en,
  input wire             ijtag_clock,
  input wire             next_test_clock_div,
  input wire             test_clock_cg_en,
  output wire            test_clock 
);
 
wire                     ijtag_clock_gated;
 
cgand tessent_persistent_cell_ijtag_clock_cg (
  .GCK                   ( ijtag_clock_gated ),
  .CK                    ( ijtag_clock ),
  .FE                    ( ijtag_clock_cg_en ),
  .TE                    ( ijtag_clock_cg_en )
);
 
 
// test_clock section begin
 
reg test_clock_enable0;
wire test_clock_enable1;
wire test_clock_int;
 
clock_or02 tessent_persistent_cell_test_clock_or_tck (
  .A0                    ( test_clock_int ),
  .A1                    ( ijtag_clock_gated ),
  .Y                     ( test_clock )
);
 
processor_core_logic_test_tessent_clk_shaper_reset_inactive tessent_persistent_cell_test_clock_shaper (
  .clk_in                ( clock ),
  .rst                   ( ~enable ),
  .en0                   ( test_clock_enable0 ),
  .en1                   ( test_clock_enable1 ),
  .clk_out               ( test_clock_int )
);
 
always @ (clock or next_test_clock_div ) begin
  if (~clock) begin
    test_clock_enable0 <= next_test_clock_div;
  end
end
 
assign test_clock_enable1 = test_clock_cg_en | next_test_clock_div;
 
// test_clock section end
endmodule

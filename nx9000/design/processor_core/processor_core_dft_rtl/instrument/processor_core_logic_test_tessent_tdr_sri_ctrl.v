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

module processor_core_logic_test_tessent_tdr_sri_ctrl (
  input wire ijtag_reset,
  input wire ijtag_sel,
  input wire ijtag_si,
  input wire ijtag_ce,
  input wire ijtag_se,
  input wire ijtag_ue,
  input wire ijtag_tck,
  output wire ext_edt_mode,
  output wire int_edt_mode,
  output wire control_test_point_en,
  output wire observe_test_point_en,
  output wire ext_ltest_en,
  output wire int_ltest_en,
  output wire ext_mode,
  output wire int_mode,
  output wire tck_occ_en,
  output wire async_set_reset_static_disable,
  output wire memory_bypass_en,
  output wire ltest_en,
  output wire ijtag_so
);
wire                ext_edt_mode_to_buf;
wire                int_edt_mode_to_buf;
wire                control_test_point_en_to_buf;
wire                observe_test_point_en_to_buf;
wire                ext_ltest_en_to_buf;
wire                int_ltest_en_to_buf;
wire                ext_mode_to_buf;
wire                int_mode_to_buf;
wire                tck_occ_en_to_buf;
wire                async_set_reset_static_disable_to_buf;
wire                memory_bypass_en_to_buf;
wire                ltest_en_to_buf;
reg    [11:0]       tdr;
reg                 retiming_so ;
reg                 ext_edt_mode_latch;
reg                 int_edt_mode_latch;
reg                 control_test_point_en_latch;
reg                 observe_test_point_en_latch;
reg                 ext_ltest_en_latch;
reg                 int_ltest_en_latch;
reg                 ext_mode_latch;
reg                 int_mode_latch;
reg                 tck_occ_en_latch;
reg                 async_set_reset_static_disable_latch;
reg                 memory_bypass_en_latch;
reg                 ltest_en_latch;
 
 
buf02 tessent_persistent_cell_ext_edt_mode ( .A (ext_edt_mode_latch), .Y (ext_edt_mode) );
buf02 tessent_persistent_cell_int_edt_mode ( .A (int_edt_mode_latch), .Y (int_edt_mode) );
buf02 tessent_persistent_cell_control_test_point_en ( .A (control_test_point_en_latch), .Y (control_test_point_en) );
buf02 tessent_persistent_cell_observe_test_point_en ( .A (observe_test_point_en_latch), .Y (observe_test_point_en) );
buf02 tessent_persistent_cell_ext_ltest_en ( .A (ext_ltest_en_latch), .Y (ext_ltest_en) );
buf02 tessent_persistent_cell_int_ltest_en ( .A (int_ltest_en_latch), .Y (int_ltest_en) );
buf02 tessent_persistent_cell_ext_mode ( .A (ext_mode_latch), .Y (ext_mode) );
buf02 tessent_persistent_cell_int_mode ( .A (int_mode_latch), .Y (int_mode) );
buf02 tessent_persistent_cell_tck_occ_en ( .A (tck_occ_en_latch), .Y (tck_occ_en) );
buf02 tessent_persistent_cell_async_set_reset_static_disable ( .A (async_set_reset_static_disable_latch), .Y (async_set_reset_static_disable) );
buf02 tessent_persistent_cell_memory_bypass_en ( .A (memory_bypass_en_latch), .Y (memory_bypass_en) );
buf02 tessent_persistent_cell_ltest_en ( .A (ltest_en_latch), .Y (ltest_en) );
 
// --------- ShiftRegister ---------
 
always @ (posedge ijtag_tck) begin
  if (ijtag_ce & ijtag_sel) begin
    tdr <= { 12'b000000000000};
  end else if (ijtag_se & ijtag_sel) begin
    tdr <= {ijtag_si,tdr[11:1]};
  end
end
 
assign ijtag_so = retiming_so;
always @ (negedge ijtag_tck) begin
  retiming_so <= tdr[0];
end
 
// --------- DataOutPort 11 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ext_edt_mode_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ext_edt_mode_latch <= tdr[11];
    end
  end
end
 
// --------- DataOutPort 10 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    int_edt_mode_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      int_edt_mode_latch <= tdr[10];
    end
  end
end
 
// --------- DataOutPort 9 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    control_test_point_en_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      control_test_point_en_latch <= tdr[9];
    end
  end
end
 
// --------- DataOutPort 8 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    observe_test_point_en_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      observe_test_point_en_latch <= tdr[8];
    end
  end
end
 
// --------- DataOutPort 7 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ext_ltest_en_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ext_ltest_en_latch <= tdr[7];
    end
  end
end
 
// --------- DataOutPort 6 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    int_ltest_en_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      int_ltest_en_latch <= tdr[6];
    end
  end
end
 
// --------- DataOutPort 5 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ext_mode_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ext_mode_latch <= tdr[5];
    end
  end
end
 
// --------- DataOutPort 4 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    int_mode_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      int_mode_latch <= tdr[4];
    end
  end
end
 
// --------- DataOutPort 3 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    tck_occ_en_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      tck_occ_en_latch <= tdr[3];
    end
  end
end
 
// --------- DataOutPort 2 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    async_set_reset_static_disable_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      async_set_reset_static_disable_latch <= tdr[2];
    end
  end
end
 
// --------- DataOutPort 1 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    memory_bypass_en_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      memory_bypass_en_latch <= tdr[1];
    end
  end
end
 
// --------- DataOutPort 0 ---------
always @ (negedge ijtag_tck or negedge ijtag_reset) begin
  if (~ijtag_reset) begin
    ltest_en_latch <= 1'b0;
  end else begin
    if (ijtag_ue & ijtag_sel) begin
      ltest_en_latch <= tdr[0];
    end
  end
end
 
endmodule

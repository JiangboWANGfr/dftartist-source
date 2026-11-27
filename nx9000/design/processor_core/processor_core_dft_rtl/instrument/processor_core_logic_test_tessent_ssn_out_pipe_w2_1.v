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

module processor_core_logic_test_tessent_ssn_out_pipe_w2_1 (
  // Stream bus signals
  input wire          bus_clock,
  input wire  [1:0]   bus_data_in,
  output wire [1:0]   bus_data_out,
  // IJTAG signals
  input wire          ijtag_reset 
);
 
wire                  bus_sync_reset_pulse;
wire                  bus_enable_sync_reset;
 
assign bus_enable_sync_reset = ~ijtag_reset;
wire                  bus_clock_int;
 
clock_buf02 tessent_persistent_cell_bus_clock_buf (
  .A                 ( bus_clock  ),
  .Y                 ( bus_clock_int  )
);
 
processor_core_logic_test_tessent_ssn_out_pipe_w2_1_fsm fsm (
  .clock                      ( bus_clock_int           ),
  .bus_enable_sync_reset      ( bus_enable_sync_reset   ),
  .bus_sync_reset_pulse       ( bus_sync_reset_pulse    ) 
);
 
processor_core_logic_test_tessent_ssn_out_pipe_w2_1_datapath datapath (
  .clock                      ( bus_clock_int           ),
  .bus_data_in                ( bus_data_in             ),
  .bus_sync_reset_pulse       ( bus_sync_reset_pulse    ),
  .bus_data_out               ( bus_data_out            )
);
 
endmodule
 
module processor_core_logic_test_tessent_ssn_out_pipe_w2_1_fsm (
  input wire          clock,
  input wire bus_enable_sync_reset,
  output wire bus_sync_reset_pulse 
);
 
reg bus_sync_reset_ff;
 
always @ (posedge clock or posedge bus_enable_sync_reset) begin
  if (bus_enable_sync_reset) begin
    bus_sync_reset_ff       <= 1'b1;
  end else begin
    bus_sync_reset_ff       <= 1'b0;
  end
end
 
assign bus_sync_reset_pulse    = bus_sync_reset_ff;
 
endmodule
 
module processor_core_logic_test_tessent_ssn_out_pipe_w2_1_datapath (
  input wire          clock,
  input wire  [1:0]   bus_data_in,
  input wire bus_sync_reset_pulse,
  output wire [1:0]   bus_data_out
);
 
reg    [1:0]          r0;
 
 
// synopsys sync_set_reset "bus_sync_reset_pulse"
always @ (posedge clock) begin
  if (bus_sync_reset_pulse) begin
    r0 <= 2'b0;
  end else begin
    r0 <= bus_data_in;
  end
end
 
assign bus_data_out = r0;
 
endmodule

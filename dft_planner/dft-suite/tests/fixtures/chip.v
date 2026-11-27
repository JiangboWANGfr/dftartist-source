module chip (clkc, rst, core_data_in, core_data_out,
             clk_ref_1, rx_data_in_1, tx_data_out_1,
             clk_ref_2, rx_data_in_2, tx_data_out_2,
             clk_ref_3, rx_data_in_3, tx_data_out_3,
             clk_ref_4, rx_data_in_4, tx_data_out_4,
             bisr_clock, bisr_trigger, bisr_prog_voltage,
             tck, trst, tms, tdi, tdo);

input         bisr_clock, bisr_trigger;
input         bisr_prog_voltage;

input clkc, rst;
input [127:0] core_data_in;
output [127:0] core_data_out;
input clk_ref_1;
input [3:0] rx_data_in_1;
output [3:0] tx_data_out_1;
input clk_ref_2;
input [3:0] rx_data_in_2;
output [3:0] tx_data_out_2;
input clk_ref_3;
input [3:0] rx_data_in_3;
output [3:0] tx_data_out_3;
input clk_ref_4;
input [3:0] rx_data_in_4;
output [3:0] tx_data_out_4;
input     tck, trst, tms, tdi;
output  tdo;
   
wire c2_i1_clkc_to_1, c2_i1_rst_to_1, c2_i1_clkc_to_2, c2_i1_rst_to_2;
wire c2_i2_clkc_to_1, c2_i2_rst_to_1, c2_i2_clkc_to_2, c2_i2_rst_to_2;
wire [63:0] c2_i1_core_data_to_1, c1_i1_core_data_out, c2_i1_core_data_to_2, c1_i2_core_data_out;   
wire [63:0] c2_i2_core_data_to_1, c1_i3_core_data_out, c2_i2_core_data_to_2, c1_i4_core_data_out;   
wire clkc_to_left, rst_to_left, clkc_to_right, rst_to_right;
wire [127:0] core_data_from_left, core_data_to_left, core_data_from_right, core_data_to_right;

c1 c1_i1 (.clk_ref(clk_ref_1), .rx_data_in(rx_data_in_1), .tx_data_out(tx_data_out_1),
          .clkc(c2_i1_clkc_to_1), .rst(c2_i1_rst_to_1), .core_data_in(c2_i1_core_data_to_1), .core_data_out(c1_i1_core_data_out));

c1 c1_i2 (.clk_ref(clk_ref_2), .rx_data_in(rx_data_in_2), .tx_data_out(tx_data_out_2),
          .clkc(c2_i1_clkc_to_2), .rst(c2_i1_rst_to_2), .core_data_in(c2_i1_core_data_to_2), .core_data_out(c1_i2_core_data_out));

c2 c2_i1 (.clkc(clkc_to_left), .rst(rst_to_left), .core_data_in(core_data_to_left), .core_data_out(core_data_from_left),
          .clkc_to_1(c2_i1_clkc_to_1), .rst_to_1(c2_i1_rst_to_1), .core_data_from_1(c1_i1_core_data_out), .core_data_to_1(c2_i1_core_data_to_1),
          .clkc_to_2(c2_i1_clkc_to_2), .rst_to_2(c2_i1_rst_to_2), .core_data_from_2(c1_i2_core_data_out), .core_data_to_2(c2_i1_core_data_to_2));

c3 c3_i1 (.clkc(clkc), .rst(rst), .core_data_in(core_data_in), .core_data_out(core_data_out),
          .clkc_to_left(clkc_to_left), .rst_to_left(rst_to_left), .core_data_from_left(core_data_from_left), .core_data_to_left(core_data_to_left),
          .clkc_to_right(clkc_to_right), .rst_to_right(rst_to_right), .core_data_from_right(core_data_from_right), .core_data_to_right(core_data_to_right),
          .bisr_clock(bisr_clock), .bisr_trigger(bisr_trigger), .bisr_prog_voltage(bisr_prog_voltage),
          .tck(tck), .trst(trst), .tms(tms), .tdi(tdi), .tdo(tdo));

c2 c2_i2 (.clkc(clkc_to_right), .rst(rst_to_right), .core_data_in(core_data_to_right), .core_data_out(core_data_from_right),
          .clkc_to_1(c2_i2_clkc_to_1), .rst_to_1(c2_i2_rst_to_1), .core_data_from_1(c1_i3_core_data_out), .core_data_to_1(c2_i2_core_data_to_1),
          .clkc_to_2(c2_i2_clkc_to_2), .rst_to_2(c2_i2_rst_to_2), .core_data_from_2(c1_i4_core_data_out), .core_data_to_2(c2_i2_core_data_to_2));

c1 c1_i3 (.clk_ref(clk_ref_3), .rx_data_in(rx_data_in_3), .tx_data_out(tx_data_out_3),
          .clkc(c2_i2_clkc_to_1), .rst(c2_i2_rst_to_1), .core_data_in(c2_i2_core_data_to_1), .core_data_out(c1_i3_core_data_out));

c1 c1_i4 (.clk_ref(clk_ref_4), .rx_data_in(rx_data_in_4), .tx_data_out(tx_data_out_4),
          .clkc(c2_i2_clkc_to_2), .rst(c2_i2_rst_to_2), .core_data_in(c2_i2_core_data_to_2), .core_data_out(c1_i4_core_data_out));

endmodule

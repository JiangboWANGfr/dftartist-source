Module dfx_clk_aux_monitor_ctrl_tdr {
  DataInPort  dfx_clock_aux_rst_n_tdr {DefaultLoadValue 1'b0;}
  DataInPort  dfx_clock_aux_div_ratio_tdr[7:0] {DefaultLoadValue 0;}
  DataInPort  dfx_clock_aux_clk_sel_tdr[5:0] {DefaultLoadValue 0;}
  DataInPort  dfx_clock_aux_pad_en_tdr {DefaultLoadValue 1'b0;}
  DataInPort  dfx_clock_aux_clk_en_tdr[63:0] {DefaultLoadValue 0;}
}

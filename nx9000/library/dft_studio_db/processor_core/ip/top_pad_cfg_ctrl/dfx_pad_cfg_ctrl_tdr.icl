Module dfx_pad_cfg_ctrl_tdr {
  DataInPort  dfx_bist_mode_sel_tdr {DefaultLoadValue 1'b0;}
  DataInPort  dfx_pad_pd_tdr[9:0] {DefaultLoadValue 0;}
  DataInPort  dfx_pad_pu_tdr[9:0] {DefaultLoadValue 0;}
  DataInPort  dfx_pad_ds0_tdr[9:0] {DefaultLoadValue 0;}
  DataInPort  dfx_pad_ds1_tdr[9:0] {DefaultLoadValue 0;}
  DataInPort  dfx_pad_ds2_tdr[9:0] {DefaultLoadValue 0;}
  DataInPort  dfx_pad_ds3_tdr[9:0] {DefaultLoadValue 0;}
  DataInPort  dfx_pad_st_tdr[9:0] {DefaultLoadValue 0;}
  DataOutPort  dfx_pll_enable_tdr {}
  DataOutPort  dfx_pll_ratio_tdr[9:0] {}
}

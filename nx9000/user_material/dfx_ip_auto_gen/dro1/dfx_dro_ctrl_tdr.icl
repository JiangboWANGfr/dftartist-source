Module dfx_dro_ctrl_tdr {
  DataInPort  dro_ijtag_ctrl_tdr[19:0] {DefaultLoadValue 0;}
  DataInPort  dro_ijtag_ctrl_en_tdr {DefaultLoadValue 1'b0;}
  DataOutPort  dro_counter_status_tdr[192:0] {}
}

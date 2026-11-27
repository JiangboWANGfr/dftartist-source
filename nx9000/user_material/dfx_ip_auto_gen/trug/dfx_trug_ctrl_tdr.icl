Module dfx_trug_ctrl_tdr {
  DataInPort  i_DTRNG_BIST_MODE_tdr {DefaultLoadValue 1'b0;}
  DataInPort  i_DTRNG_BIST_RSTN_tdr {DefaultLoadValue 1'b0;}
  DataInPort  i_DTRNG_BIST_SEL_tdr[15:0] {DefaultLoadValue 0;}
  DataInPort  i_DTRNG_BIST_TEST_SIZE_tdr[3:0] {DefaultLoadValue 0;}
  DataInPort  i_DTRNG_BIST_ACT_CUTOFF_tdr[15:0] {DefaultLoadValue 0;}
  DataInPort  i_DTRNG_BIST_MB_CUTOFF_tdr[15:0] {DefaultLoadValue 0;}
  DataInPort  i_DTRNG_BIST_SBIST_EN_tdr {DefaultLoadValue 1'b0;}
  DataInPort  i_DTRNG_BIST_LAD_RESET_tdr {DefaultLoadValue 1'b0;}
  DataInPort  i_STMODE_tdr {DefaultLoadValue 1'b0;}
  DataOutPort  o_DTRNG_BIST_ERROR_tdr {}
  DataOutPort  o_DTRNG_BIST_DONE_tdr {}
  DataOutPort  o_FAULT_LAD_DETECT_QF_tdr {}
  DataOutPort  o_FAULT_LAD_DETECT_QL_tdr {}
}

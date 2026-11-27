Module dfx_trug_ctrl_tdr {
  DataInPort  o_DTRNG_BIST_ERROR_tdr {DefaultLoadValue 1'b0;}
  DataInPort  o_DTRNG_BIST_DONE_tdr {DefaultLoadValue 1'b0;}
  DataInPort  o_FAULT_LAD_DETECT_QF_tdr {DefaultLoadValue 1'b0;}
  DataInPort  o_FAULT_LAD_DETECT_QL_tdr {DefaultLoadValue 1'b0;}
  DataOutPort  i_DTRNG_BIST_MODE_tdr {}
  DataOutPort  i_DTRNG_BIST_RSTN_tdr {}
  DataOutPort  i_DTRNG_BIST_SEL_tdr[15:0] {}
  DataOutPort  i_DTRNG_BIST_TEST_SIZE_tdr[3:0] {}
  DataOutPort  i_DTRNG_BIST_ACT_CUTOFF_tdr[15:0] {}
  DataOutPort  i_DTRNG_BIST_MB_CUTOFF_tdr[15:0] {}
  DataOutPort  i_DTRNG_BIST_SBIST_EN_tdr {}
  DataOutPort  i_DTRNG_BIST_LAD_RESET_tdr {}
}

read_config_data -in_wrapper $dftspec -rep -from_string {
  Occ {
    ijtag_host_interface : Sib(occ);
    capture_window_size: 5;
    include_clocks_in_icl_model : on;
    Controller(dco_clk) {
      clock_intercept_node      : dco_clk;
    }
    Controller(clock_test_testpoint) {
      clock_intercept_node      : u_dfx_clk_test_testpoint_persistent_buf/Z;
    }
  }
}

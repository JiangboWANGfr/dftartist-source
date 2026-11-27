create_instance  u_pll_ctrl_ds1 -of_module pll_ctrl_ds1
create_connection  u_dfx_static_hyper_ctl_tdr/dfx_mode u_pll_ctrl_ds1/dfx_mode


add_input_pin_dft_mux_override "PLL_1/enable" "u_pll_ctrl_ds1/enable" "u_dfx_static_hyper_ctl_tdr/dfx_mode" "u_dfx_PLL_1_enable_persistent_mux_inst_ds1"
create_connection "PLL_1/LOCKED" "u_pll_ctrl_ds1/LOCKED"



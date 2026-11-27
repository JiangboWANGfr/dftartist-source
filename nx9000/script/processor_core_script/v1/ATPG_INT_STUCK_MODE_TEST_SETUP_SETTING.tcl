#----------------------------------------------
set_static_dft_signal_values tck_occ_en 1
source $prj_path/user_material/PDL/dfx_static_hyper_ctl_tdr.pdl
set_test_setup_icall {u_dfx_static_hyper_ctl_tdr.dfx_sa_hyper_cfg} -merge -append
set_ijtag_retargeting_options -tck_ratio 4      


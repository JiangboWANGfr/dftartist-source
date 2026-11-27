report_config_data $dftspec
#Begin design modify
proc user_post_process {root_wrapper args} {
#add yours setting if need

}
register_callback process_dft_specification.post_insertion user_post_process

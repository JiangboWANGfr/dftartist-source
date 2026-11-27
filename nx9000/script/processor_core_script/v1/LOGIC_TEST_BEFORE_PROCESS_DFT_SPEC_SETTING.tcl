
# From /home/wongw/nx9000/dft_studio_db/processor_core/spec/logic_test/edt.spec
read_config_data -in_wrapper $dftspec -from_string {
  EDT {
    ijtag_host_interface : Sib(edt);
    Controller (INT_EDT) {
      longest_chain_range    : 360, 440;
      scan_chain_count       : 4915;
      input_channel_count    : 33;
      output_channel_count   : 33;
      separate_control_data_channels: on;
      Compactor {
         pipeline_logic_levels_in_compactor : 2;
      }
      ShiftPowerOptions {
         present : on;
         min_switching_threshold_percentage: 5 ;
        }
      Connections {
         mode_enables: DftSignal(int_edt_mode);
         EdtChannelsIn(33:1) {
                PipelineStage {
                 leaf_instance_name: dfx_int_edt_channels_in_pipe;
                }
         }
         EdtChannelsOut(33:1) {
                PipelineStage {
                 leaf_instance_name: dfx_int_edt_channels_out_pipe;
                }
         }
      }
    }
    Controller (EXT_EDT) {
      longest_chain_range    : 270, 330;
      scan_chain_count       : 246;
      input_channel_count    : 2;
      output_channel_count   : 2;
      separate_control_data_channels: off;
      Compactor {
         pipeline_logic_levels_in_compactor : 2;
      }
      ShiftPowerOptions {
         present : on;
         min_switching_threshold_percentage: 5 ;
        }
      Connections {
         mode_enables: DftSignal(ext_edt_mode);
         EdtChannelsIn(2:1) {
                PipelineStage {
                 leaf_instance_name: dfx_ext_edt_channels_in_pipe;
                }
         }
         EdtChannelsOut(2:1) {
                PipelineStage {
                 leaf_instance_name: dfx_ext_edt_channels_out_pipe;
                }
         }
      }
    }
  }
}

# From /home/wongw/nx9000/dft_studio_db/processor_core/spec/logic_test/occ.spec
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

# From /home/wongw/nx9000/dft_studio_db/processor_core/spec/logic_test/ssn.spec
read_config_data -in_wrapper $dftspec -rep -from_string {
  SSN {
    ijtag_host_interface : Sib(ssn);
    DataPath(1) {
      output_bus_width       : 2;
      OutputPipeline(2) {
      }
      ScanHost(1) {
	  use_clock_shaper_cell: on;
	  support_from_scan_out_le_strobing: off;
      }
      Receiver1xPipeline(1) {
      }
    }
  }
}
###from user setting
#add yours setting if need


###from default design setting
#latch to flop\n";
set sibs [get_config_elements Sib(*) -hier]
set_config_value [get_config_elements to_scan_in_feedthrough -in_wrappers $sibs] pipeline
set_config_value $dftspec/IjtagNetwork/ImplementationOptions/scan_path_retiming flop

proc reset_post_process {root_wrapper args} {
  #set dft_ctrl_async_set_reset_dynamic_disable_or2_pin [get_name_list [get_pins -of_instance [get_instance *dft_ctrl_async_set_reset_dynamic_disable_or2* -hier] -direction output -silent] -silent]
  #if {$dft_ctrl_async_set_reset_dynamic_disable_or2_pin ne ""} {
  #   foreach pins $dft_ctrl_async_set_reset_dynamic_disable_or2_pin {
  #       add_output_pin_dft_mux_override $pins "u_dfx_dynamic_hyper_ctl/dfx_rst_scan_n" "u_dfx_static_hyper_ctl_tdr/dfx_scan_mode"
  #   }
  #}
  set dynamic_hyper_ctl_se [get_name_list [get_pins *u_dfx_dynamic_hyper_ctl/scan_enable -hier -silent] -silent]
  if {$dynamic_hyper_ctl_se ne ""} {
      delete_connection [get_pins *u_dfx_dynamic_hyper_ctl/scan_enable -hier]
      create_connection [get_pins *u_dfx_dynamic_hyper_ctl/scan_enable -hier] [get_pins [get_name_list [get_dft_signal scan_en]]]
  }
  set dynamic_hyper_ctl_async_set_reset_static_disable [get_name_list [get_pins *u_dfx_dynamic_hyper_ctl/async_set_reset_static_disable -hier -silent] -silent]
  if {$dynamic_hyper_ctl_async_set_reset_static_disable ne ""} {
      delete_connection [get_pins *u_dfx_dynamic_hyper_ctl/async_set_reset_static_disable -hier]
      create_connection [get_pins *u_dfx_dynamic_hyper_ctl/async_set_reset_static_disable -hier] [get_pins [get_name_list [get_dft_signal async_set_reset_static_disable]]]
  }           
}
register_callback process_dft_specification.post_insertion reset_post_process

###Design modify from user setting
proc user_post_process {root_wrapper args} {
#add tcl proc or script here
create_connection [get_pins tessent_persistent_cell_shift_capture_clock/GCK] [get_pins u_dfx_clk_test_testpoint_persistent_buf/A]

}
register_callback process_dft_specification.post_insertion user_post_process

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

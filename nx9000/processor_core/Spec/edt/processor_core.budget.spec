DftSpecification(processor_core,logic_test) {
  EDT {
    ijtag_host_interface          : Sib(edt);
    Controller(int_edt) {
      longest_chain_range             : 360, 440;
      scan_chain_count                : 5;
      input_channel_count             : 1;
      output_channel_count            : 1;
      separate_control_data_channels  : on;
      Compactor {
        pipeline_logic_levels_in_compactor: 2;
      }
      ShiftPowerOptions {
        present               : on;
        min_switching_threshold_percentage: 5;
      }
      Connections {
        ssh_chain_group           : edt_gp;
        mode_enables              : DftSignal(int_edt_mode);
        EdtChannelsIn(1:1) {
          PipelineStage {
            leaf_instance_name    : dfx_int_edt_channels_in_pipe;
          }
        }
        EdtChannelsOut(1:1) {
          PipelineStage {
            leaf_instance_name    : dfx_int_edt_channels_out_pipe;
          }
        }
        scan_en                   : OptionalDftSignal(scan_en);
      }
    }
    Controller(ext_edt) {
      longest_chain_range             : 270, 330;
      scan_chain_count                : 2;
      input_channel_count             : 2;
      output_channel_count            : 2;
      separate_control_data_channels  : off;
      Compactor {
        pipeline_logic_levels_in_compactor: 2;
      }
      ShiftPowerOptions {
        present               : on;
        min_switching_threshold_percentage: 5;
      }
      Connections {
        ssh_chain_group           : edt_gp;
        mode_enables              : DftSignal(ext_edt_mode);
        EdtChannelsIn(2:1) {
          PipelineStage {
            leaf_instance_name    : dfx_ext_edt_channels_in_pipe;
          }
        }
        EdtChannelsOut(2:1) {
          PipelineStage {
            leaf_instance_name    : dfx_ext_edt_channels_out_pipe;
          }
        }
        scan_en                   : OptionalDftSignal(scan_en);
      }
    }
  }
}

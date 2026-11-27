read_config_data -in_wrapper $dftspec -rep -from_string {
SSN {
    ijtag_host_interface        : Sib(ssn);
    DataPath (1) {
      output_bus_width            : 32;
      Connections {
        bus_clock_in                : ssn_bus_clock;
        bus_data_in                 : ssn_bus_data_in[31:0];
        bus_data_out                : ssn_bus_data_out[31:0];
      }
      OutputPipeline (opp_1) {
      }
      ScanHost (ssh_1) {
        ChainGroup (int_edt) {
          input_chain_count           : 1;
          output_chain_count          : 1;
        }
        ChainGroup (ext_edt) {
        }
      }
      Multiplexer (mux_1) {
        Connections {
          secondary_bus_data_in       : left1_ssn_from_bus_data_out[31:0];
        }
        Pipeline (pp_1) {
        }
      }
      Receiver1xPipeline (rpp_1) {
        ExtraOutputPath {
          output_bus_width            : 32;
          Connections {
            bus_clock_out               : left1_ssn_to_bus_clock;
            bus_data_out                : left1_ssn_to_bus_data_in[31:0];
          }
        }
      }
    }
  }
}

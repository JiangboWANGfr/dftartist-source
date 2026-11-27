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

read_config_data -in_wrapper $dftspec -rep -from_string {
EDT {
    ijtag_host_interface        : Sib(edt);
    Controller (int_edt) {
      longest_chain_range         : 360, 440;
      scan_chain_count            : 4;
      input_channel_count         : 1;
      output_channel_count        : 1;
      Connections {
        ssh_chain_group             : int_edt;
      }
    }
    Controller (ext_edt) {
      Connections {
        ssh_chain_group             : ext_edt;
      }
    }
  }
}

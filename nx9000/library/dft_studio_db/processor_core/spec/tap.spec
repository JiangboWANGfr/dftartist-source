set tap_ports_spec [get_name_list [add_config_element HostScanInterface(tap_ports) -in [get_config_element $dftspec/IjtagNetwork]]]
set_config_value $tap_ports_spec/Interface/trst PAD_A3
set_config_value $tap_ports_spec/Interface/tms PAD_A2
set_config_value $tap_ports_spec/Interface/tck PAD_A1
set_config_value $tap_ports_spec/Interface/tdi PAD_A0
set_config_value $tap_ports_spec/Interface/tdo PAD_A4

set_config_value $dftspec/IjtagNetwork/HostScanInterface(tap)/Interface/trst u_dfx_trstn_persistent_and_inst/Z
set_config_value $dftspec/IjtagNetwork/HostScanInterface(tap)/Interface/tms u_dfx_tms_persistent_and_inst/Z
set_config_value $dftspec/IjtagNetwork/HostScanInterface(tap)/Interface/tck u_dfx_tck_persistent_and_inst/Z
set_config_value $dftspec/IjtagNetwork/HostScanInterface(tap)/Interface/tdi u_dfx_tdi_persistent_and_inst/Z
set_config_value $dftspec/IjtagNetwork/HostScanInterface(tap)/Interface/tdo u_dfx_tdo_persistent_mux_inst/in2
set_config_value $dftspec/IjtagNetwork/HostScanInterface(tap)/Interface/tdo_en  u_dfx_tdo_en_persistent_mux_inst/in2



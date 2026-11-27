Module dfx_pvt_ctrl_tdr {
  DataInPort  HTOL_SEL_tdr {DefaultLoadValue 1'b0;}
  DataInPort  AMUX_ADDR_TS_tdr[1:0] {DefaultLoadValue 0;}
  DataInPort  AVG_MODE_TS_tdr[1:0] {DefaultLoadValue 0;}
  DataInPort  BGR_I_CON_TS_tdr[1:0] {DefaultLoadValue 0;}
  DataInPort  BGR_TC_CON_TS_tdr[1:0] {DefaultLoadValue 0;}
  DataInPort  BJT_SEL_TS_tdr[3:0] {DefaultLoadValue 0;}
  DataInPort  DMUX_ADDR_TS_tdr[1:0] {DefaultLoadValue 0;}
  DataInPort  EN_TS_tdr {DefaultLoadValue 1'b0;}
  DataInPort  OFFSET_CON_TS_tdr[3:0] {DefaultLoadValue 0;}
  DataInPort  SLOPE_CON_TS_tdr[6:0] {DefaultLoadValue 0;}
  DataInPort  SOC_TS_tdr {DefaultLoadValue 1'b0;}
  DataInPort  TEST_MODE_TS_tdr {DefaultLoadValue 1'b0;}
  DataInPort  I_EN_CYCLE_tdr {DefaultLoadValue 1'b0;}
  DataInPort  EN_PS_tdr[2:0] {DefaultLoadValue 0;}
  DataInPort  SOC_PS_tdr {DefaultLoadValue 1'b0;}
  DataInPort  SEL_TS_tdr[3:0] {DefaultLoadValue 0;}
  DataInPort  VOL_RANGE_TS_tdr {DefaultLoadValue 1'b0;}
  DataInPort  SLOPE_CONT_VS_tdr[6:0] {DefaultLoadValue 0;}
  DataInPort  I_HFDIV_PS_tdr {DefaultLoadValue 1'b0;}
  DataInPort  I_PS_SEL_tdr[5:0] {DefaultLoadValue 0;}
  DataOutPort  OUT_12BIT_TS_tdr[11:0] {}
  DataOutPort  EOC_TS_tdr {}
  DataOutPort  OUT_12BIT_PS_tdr {}
  DataOutPort  EOC_PS_tdr {}
}

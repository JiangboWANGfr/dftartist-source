Module dfx_static_hyper_ctl_tdr {
  DataInPort  dfx_mode_tdr                         {DefaultLoadValue 1'b0;}
  DataInPort  dfx_mbist_mode_tdr                   {DefaultLoadValue 1'b0;}
  DataInPort  dfx_scan_mode_tdr                    {DefaultLoadValue 1'b0;}
  DataInPort  dfx_sa_mode_tdr                      {DefaultLoadValue 1'b0;}
  DataInPort  dfx_as_mode_tdr                      {DefaultLoadValue 1'b0;}
  DataInPort  dfx_lbist_mode_tdr                   {DefaultLoadValue 1'b0;}
  DataInPort  dfx_rst_crg_n_tdr                    {DefaultLoadValue 1'b0;}
  DataInPort  dfx_rst_tdr_n_tdr                    {DefaultLoadValue 1'b0;}
  DataInPort  dfx_hyper_ctl_ff_init_tdr            {DefaultLoadValue 1'b0;}
  DataInPort  dfx_apc_icg_mode_tdr                 {DefaultLoadValue 1'b0;}
  DataInPort  dfx_cp_icg_mode_tdr                  {DefaultLoadValue 1'b0;}
  DataInPort  dfx_mem_clk_sel_tdr                  {DefaultLoadValue 1'b0;}
  DataInPort  dfx_leaf_scan_tdr                    {DefaultLoadValue 1'b0;}
  DataInPort  dfx_func_rst_observe_en_tdr          {DefaultLoadValue 1'b0;}
  DataInPort  dfx_hyper_reserve_ctl_tdr[$HYPER_RESEVER_TDR_SIZE-1 :0] {DefaultLoadValue 0;}
  DataInPort  dfx_func_reset_static_ctrl_tdr       {DefaultLoadValue 1'b0;}
  Parameter HYPER_RESEVER_TDR_SIZE = 8;
}

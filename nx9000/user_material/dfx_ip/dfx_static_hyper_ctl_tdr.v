module  dfx_static_hyper_ctl_tdr #(parameter HYPER_RESEVER_TDR_SIZE = 32) (
   //input
   input wire        ptest_dfx_mode,
   input wire        dfx_mode_tdr,
   input wire        dfx_ist_mode_tdr,
   input wire        dfx_mbist_mode_tdr,       
   input wire        dfx_scan_mode_tdr,        
   input wire        dfx_sa_mode_tdr,          
   input wire        dfx_as_mode_tdr,          
   input wire        dfx_lbist_mode_tdr,          
   input wire        dfx_rst_crg_n_tdr,        
   input wire        dfx_rst_tdr_n_tdr,        
   input wire        dfx_hyper_ctl_ff_init_tdr,
   input wire        dfx_apc_icg_mode_tdr,     
   input wire        dfx_cp_icg_mode_tdr,      
   input wire        dfx_mem_clk_sel_tdr,      
   input wire        dfx_leaf_scan_tdr,        
   input wire        dfx_func_rst_observe_en_tdr,
   input wire [HYPER_RESEVER_TDR_SIZE-1:0]  dfx_hyper_reserve_ctl_tdr,
   input wire        dfx_func_reset_static_ctrl_tdr,
   //output
   output wire       dfx_mode,
   output wire       dfx_ist_mode,
   output wire       dfx_mbist_mode,       
   output wire       dfx_scan_mode,        
   output wire       dfx_sa_mode,          
   output wire       dfx_as_mode,          
   output wire       dfx_lbist_mode,          
   output wire       dfx_rst_crg_n,        
   output wire       dfx_rst_tdr_n,        
   output wire       dfx_hyper_ctl_ff_init,
   output wire       dfx_apc_icg_mode,     
   output wire       dfx_cp_icg_mode,      
   output wire       dfx_mem_clk_sel,      
   output wire       dfx_leaf_scan,
   output wire       dfx_func_rst_observe_en,
   output wire [HYPER_RESEVER_TDR_SIZE-1:0] dfx_hyper_reserve_ctl,
   output wire       dfx_func_reset_static_ctrl,
   output wire       dfx_scan_aux_en
);

cell_buf    u_dfx_mode_persistent_buf_inst     (.Z(dfx_mode ),   .A(dfx_mode_tdr));
cell_buf    u_dfx_ist_mode_persistent_buf_inst (.Z(dfx_ist_mode ),   .A(dfx_ist_mode_tdr));
cell_and2   u_dfx_mbist_mode_persistent_and2_inst          (.Z(dfx_mbist_mode         ),   .A1(dfx_mbist_mode_tdr         ),   .A2(dfx_mode));
cell_and2   u_dfx_scan_mode_persistent_and2_inst           (.Z(dfx_scan_mode          ),   .A1(dfx_scan_mode_tdr          ),   .A2(dfx_mode));
cell_and2   u_dfx_scan_aux_en_persistent_and2_inst         (.Z(dfx_scan_aux_en        ),   .A1(dfx_scan_mode          ),   .A2(ptest_dfx_mode));
cell_and2   u_dfx_sa_mode_persistent_and2_inst             (.Z(dfx_sa_mode            ),   .A1(dfx_sa_mode_tdr            ),   .A2(dfx_mode));
cell_and2   u_dfx_as_mode_persistent_and2_inst             (.Z(dfx_as_mode            ),   .A1(dfx_as_mode_tdr            ),   .A2(dfx_mode));
cell_and2   u_dfx_lbist_mode_persistent_and2_inst          (.Z(dfx_lbist_mode         ),   .A1(dfx_lbist_mode_tdr         ),   .A2(dfx_mode));
cell_and2   u_dfx_rst_crg_n_persistent_and2_inst           (.Z(dfx_rst_crg_n          ),   .A1(dfx_rst_crg_n_tdr          ),   .A2(dfx_mode));
cell_and2   u_dfx_rst_tdr_n_persistent_and2_inst           (.Z(dfx_rst_tdr_n          ),   .A1(dfx_rst_tdr_n_tdr          ),   .A2(dfx_mode));
cell_and2   u_dfx_rst_scan_n_init_persistent_and2_inst     (.Z(dfx_rst_scan_n_init    ),   .A1(dfx_rst_scan_n_init_tdr    ),   .A2(dfx_mode));
cell_and2   u_dfx_hyper_ctl_ff_init_persistent_and2_inst   (.Z(dfx_hyper_ctl_ff_init  ),   .A1(dfx_hyper_ctl_ff_init_tdr  ),   .A2(dfx_mode));
cell_and2   u_dfx_apc_icg_mode_persistent_and2_inst        (.Z(dfx_apc_icg_mode       ),   .A1(dfx_apc_icg_mode_tdr       ),   .A2(dfx_mode));
cell_and2   u_dfx_cp_icg_mode_persistent_and2_inst         (.Z(dfx_cp_icg_mode        ),   .A1(dfx_cp_icg_mode_tdr        ),   .A2(dfx_mode));
cell_and2   u_dfx_mem_clk_sel_persistent_and2_inst         (.Z(dfx_mem_clk_sel        ),   .A1(dfx_mem_clk_sel_tdr        ),   .A2(dfx_mode));
cell_and2   u_dfx_leaf_scan_persistent_and2_inst           (.Z(dfx_leaf_scan          ),   .A1(dfx_leaf_scan_tdr          ),   .A2(dfx_mode));
cell_and2   u_dfx_func_rst_persistent_and2_inst            (.Z(dfx_func_rst_observe_en),   .A1(dfx_func_rst_observe_en_tdr),   .A2(dfx_mode));
cell_and2   u_dfx_func_reset_static_ctrl_persistent_and2_inst   (.Z(dfx_func_reset_static_ctrl),   .A1(dfx_func_reset_static_ctrl_tdr),   .A2(dfx_mode));
generate
    genvar i;
    for(i=0;i<HYPER_RESEVER_TDR_SIZE;i=i+1) 
    begin : hyper_reserve_ctl
      cell_and2   u_dfx_hyper_reserve_ctl_persistent_and2_inst   (.Z(dfx_hyper_reserve_ctl[i]  ),   .A1(dfx_hyper_reserve_ctl_tdr[i]  ),   .A2(dfx_mode));
    end
endgenerate

endmodule


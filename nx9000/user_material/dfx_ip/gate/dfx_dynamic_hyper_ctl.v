module dfx_dynamic_hyper_ctl #(parameter APC_CP_SIZE = 8) (
    //input
    input wire dfx_mbist_mode,
	input wire dfx_lbist_mode,
    input wire dfx_scan_mode,
    input wire dfx_sa_mode,
	input wire dfx_as_mode,
	input wire lbist_rst_scan_n,
	input wire dfx_leaf_mode,
    input wire dfx_apc_icg_mode,
    input wire dfx_cp_icg_mode,
    input wire clk_test_testpoint,
    input wire scan_enable,
    input wire dfx_hyper_ctl_ff_init,
    input wire rst_tdr_n_init,
    input wire async_set_reset_static_disable,
    //output
	output wire lbist_efc_only_se,
	output wire lbist_pmc_only_se,
    output wire dfx_sa_only_se,
    output wire dfx_icg_mode,
    output wire dfx_mbist_clk_path_icg_en,
    output wire [APC_CP_SIZE-1:0] dfx_apc_cp_hyper_ctl,
	output wire dfx_icg_type1,
	output wire dfx_icg_type2,
	output wire dfx_icg_type3,
	output wire dfx_icg_type4,
	output wire dfx_icg_type5,
	output wire dfx_icg_type6,
	output wire dfx_icg_type7,
    output wire dfx_rst_scan_n,
    output wire dfx_rst_scan_p,
    output wire dfx_set_scan_n,
    output wire dfx_set_scan_p
);
assign dfx_mbist_clk_path_icg_en = dfx_icg_mode | dfx_mbist_mode;
assign dfx_sa_only_se = scan_enable && dfx_sa_mode;
assign lbist_efc_only_se = scan_enable && !dfx_lbist_mode;
assign lbist_pmc_only_se = scan_enable && !dfx_lbist_mode && dfx_sa_mode;
//======================================
//dfx icg control circuit for the rtl exist icg
//======================================
sig_dff dfx_icg_tp_ff_inst(
    .sig_out(dfx_icg_tp_internal),
    .sig_in(dfx_icg_tp_internal),
    .rst_n(dfx_hyper_ctl_ff_init),
    .clk(clk_test_testpoint)
);

cell_or2  dfx_icg_tp_internal_or_se_persistent_or2_inst (
     .Z(dfx_icg_tp_internal_or_se), 
     .A1(dfx_icg_tp_internal), 
     .A2(scan_enable)
);
dmux2_1   dfx_icg_mode_int_persistent_level1 (
      .in1(scan_enable), 
      .in2(dfx_icg_tp_internal_or_se), 
      .c(dfx_sa_mode), 
      .out(dfx_icg_mode_int)
);
cell_and2  dfx_icg_persistent_and2_inst (
      .Z(dfx_icg_mode), 
      .A1(dfx_icg_mode_int), 
      .A2(dfx_scan_mode)
);

//===================================================
//capture power and atpg pattern count control engine
//for the icg which generate by synthesis
//===================================================
wire [APC_CP_SIZE-1:0] apc_cp_hyper_ctl_ff;
wire [APC_CP_SIZE-1:0] dfx_apc_cp_hyper_ctl_with_apc_override;
wire [APC_CP_SIZE-1:0] dfx_apc_cp_hyper_ctl_with_cp_override;
wire [APC_CP_SIZE-1:0] dfx_apc_cp_hyper_ctl_with_apc_cp_se_override;
generate
    genvar i;
    for(i=0;i<APC_CP_SIZE;i=i+1)
    begin: hyper_apc_cp_hyper_ctrl
           sig_dff apc_cp_hyper_ctl_ff_inst (
               .sig_out(apc_cp_hyper_ctl_ff[i]),
               .sig_in(apc_cp_hyper_ctl_ff[i]),
               .rst_n(dfx_hyper_ctl_ff_init),
               .clk(clk_test_testpoint)
           );
           cell_or2   dfx_apc_cp_hyper_ctl_persistent_or2_apc_inst (
                .Z(dfx_apc_cp_hyper_ctl_with_apc_override[i]),  
                .A1(apc_cp_hyper_ctl_ff[i]), 
                .A2(dfx_apc_icg_mode)
           );
           cell_and2  dfx_apc_cp_hyper_ctl_persistent_and2_cp_inst (
                .Z(dfx_apc_cp_hyper_ctl_with_cp_override[i]),   
                .A1(dfx_apc_cp_hyper_ctl_with_apc_override[i]),   
                .A2(~dfx_cp_icg_mode)
           );
           cell_or2   dfx_apc_cp_hyper_ctl_se_persistent_or2_inst  (
                .Z(dfx_apc_cp_hyper_ctl_with_apc_cp_se_override[i]),
                .A1(dfx_apc_cp_hyper_ctl_with_cp_override[i]),
                .A2(scan_enable)
           );
           cell_and2  dfx_apc_cp_hyper_ctrl_persistent_and2_inst    (
                .Z(dfx_apc_cp_hyper_ctl[i]),
                .A1(dfx_apc_cp_hyper_ctl_with_apc_cp_se_override[i]), 
                .A2(dfx_scan_mode)
           );
    end
endgenerate


//======================================
//scan rst control circuit
//======================================
wire dfx_rst_scan_n_int;
sig_dff rst_scan_n_hold_ff_inst(
    .sig_out(dfx_rst_scan_n_int),
    .sig_in(dfx_rst_scan_n_int),
    .rst_n(rst_tdr_n_init),
    .clk(clk_test_testpoint)
);
wire dfx_rst_scan_n_to_mux_level1;
wire dfx_rst_scan_n_internal;
wire dfx_rst_scan_n_o_internal;

cell_or3 rst_scan_n_dynamic_process_persistent_inst(
    .Z(dfx_rst_scan_n_internal),
    .A1(dfx_rst_scan_n_int),
    .A2(scan_enable),
    .A3(async_set_reset_static_disable)
);
cell_or3 rst_scan_n_disable_process_persistent_inst(
    .Z(dfx_rst_scan_n_o_internal),
	.A1(dfx_mbist_mode), ///aaa
	.A2(dfx_as_mode),
	.A3(dfx_rst_scan_n_internal)
);

assign dfx_rst_scan_n = dfx_lbist_mode? lbist_rst_scan_n : dfx_rst_scan_n_o_internal;
assign dfx_rst_scan_p = ~dfx_rst_scan_n;

//======================================
//scan set control circuit
//======================================
wire dfx_set_scan_n_int;
sig_dff set_scan_n_hold_ff_inst(
    .sig_out(dfx_set_scan_n_int),
    .sig_in(dfx_set_scan_n_int),
    .rst_n(rst_tdr_n_init),
    .clk(clk_test_testpoint)
);
wire dfx_set_scan_n_to_mux_level1;
wire dfx_set_scan_n_internal;
wire dfx_set_scan_n_o_internal;

cell_or3 set_scan_n_dynamic_process_persistent_inst(
    .Z(dfx_set_scan_n_internal),
    .A1(dfx_set_scan_n_int),
    .A2(scan_enable),
    .A3(async_set_reset_static_disable)
);
cell_or3 set_scan_n_disable_process_persistent_inst(
    .Z(dfx_set_scan_n_o_internal),
	.A1(dfx_mbist_mode), ///aaa
	.A2(dfx_as_mode),
	.A3(dfx_set_scan_n_internal)
);
assign dfx_set_scan_n = dfx_lbist_mode? lbist_set_scan_n : dfx_set_scan_n_o_internal;
assign dfx_set_scan_p = ~dfx_set_scan_n;

assign dfx_icg_type1 = dfx_icg_mode;
assign dfx_icg_type2 = dfx_icg_mode | (dfx_mbist_mode && ~dfx_lbist_mode);
assign dfx_icg_type3 = dfx_icg_mode | (dfx_mbist_mode && ~dfx_lbist_mode);
assign dfx_icg_type4 = dfx_icg_mode | dfx_leaf_mode;
assign dfx_icg_type6 = dfx_sa_mode ? (dfx_icg_mode | dfx_lbist_mode) : dfx_as_mode; 
assign dfx_icg_type7 = dfx_sa_mode ? (dfx_icg_mode | dfx_lbist_mode) : (dfx_as_mode | dfx_mbist_mode);
endmodule


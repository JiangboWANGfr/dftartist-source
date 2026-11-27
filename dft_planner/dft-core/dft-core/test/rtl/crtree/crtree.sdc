# fixture SDC: one real clock, one case-analysis constant; clk_free deliberately unconstrained
create_clock -name CLKA -period 10.0 [get_ports {clk_a}]
set_case_analysis 1 [get_ports rst_n]

##############################################################################
#                                                                            #
#                            CLOCK DEFINITION                                #
#                                                                            #
##############################################################################

#set CLOCK_PERIOD 100.0; #  10 MHz
#set CLOCK_PERIOD 66.6; #  15 MHz
#set CLOCK_PERIOD 50.0; #  20 MHz
#set CLOCK_PERIOD 40.0; #  25 MHz
#set CLOCK_PERIOD 33.3; #  30 MHz
#set CLOCK_PERIOD 30.0; #  33 MHz
#set CLOCK_PERIOD 25.0; #  40 MHz
#set CLOCK_PERIOD 22.2; #  45 MHz
#set CLOCK_PERIOD 20.0; #  50 MHz
#set CLOCK_PERIOD 16.7; #  60 MHz
#set CLOCK_PERIOD 15.4; #  65 MHz
#set CLOCK_PERIOD 15.0; #  66 MHz
#set CLOCK_PERIOD 14.3; #  70 MHz
#set CLOCK_PERIOD 12.5; #  80 MHz
#set CLOCK_PERIOD 11.1; #  90 MHz
set CLOCK_PERIOD 10.0; # 100 MHz
#set CLOCK_PERIOD  8.0; # 125 MHz


create_clock -name     "dco_clk"                              \
             -period   "$CLOCK_PERIOD"                        \
             -waveform "[expr $CLOCK_PERIOD/2] $CLOCK_PERIOD" \
             [get_ports dco_clk]


##############################################################################
#                                                                            #
#      ADDITIONAL PRIMARY CLOCKS -- lfxt_clk/inclk/taclk are real, used     #
#      top-level clock ports (lfxt_clk feeds omsp_clock_module's mux;       #
#      inclk/taclk clock the MBIST stress-test memory blocks) that had no   #
#      create_clock at all until now.                                      #
#                                                                            #
##############################################################################

set LFXT_PERIOD   30517.6; #  32.768 kHz watch crystal
set INCLK_PERIOD     12.0; #  ~83 MHz -- inclk memory-domain stress clock
set TACLK_PERIOD     15.0; #  ~66 MHz -- Timer_A external clock / taclk memory-domain

create_clock -name "lfxt_clk" -period "$LFXT_PERIOD" [get_ports lfxt_clk]
create_clock -name "inclk"    -period "$INCLK_PERIOD" [get_ports inclk]
create_clock -name "taclk"    -period "$TACLK_PERIOD" [get_ports taclk]


##############################################################################
#                                                                            #
#      GENERATED CLOCKS -- omsp_clock_module (clock_module_0) really does   #
#      mux dco_clk/lfxt_clk into mclk/smclk (omsp_clock_mux, glitch-free    #
#      2:1 mux) and gates lfxt_clk into aclk, each through a real           #
#      software-selectable /1/2/4/8 divider (BCSCTL2.DIVMx/DIVSx/DIVAx).    #
#      Modeled here with -add on the two mux inputs and a representative   #
#      ratio per branch (not every DIVMx corner -- illustrative, not an    #
#      exhaustive multi-corner STA setup).                                  #
#                                                                            #
##############################################################################

# mclk: muxed from dco_clk or lfxt_clk, then divided.
create_generated_clock -name mclk_from_dco  -source [get_ports dco_clk]  \
             -master_clock dco_clk  -divide_by 2 -add \
             [get_nets PROCESSOR_1/clock_module_0/mclk]
create_generated_clock -name mclk_from_lfxt -source [get_ports lfxt_clk] \
             -master_clock lfxt_clk -combinational -add \
             [get_nets PROCESSOR_1/clock_module_0/mclk]

# smclk: same mux structure as mclk, different representative ratios.
create_generated_clock -name smclk_from_dco  -source [get_ports dco_clk]  \
             -master_clock dco_clk  -divide_by 4 -add \
             [get_nets PROCESSOR_1/clock_module_0/smclk]
create_generated_clock -name smclk_from_lfxt -source [get_ports lfxt_clk] \
             -master_clock lfxt_clk -edges {1 5} -add \
             [get_nets PROCESSOR_1/clock_module_0/smclk]

# aclk: sourced only from lfxt_clk in this design (no mux) -- no -master_clock
# given here on purpose, so the tool must INFER it from -source, same as the
# soc_clockgen.sdc stress fixture's GEN_INFERRED case.
create_generated_clock -name aclk -source [get_ports lfxt_clk] \
             -divide_by 4 \
             [get_nets PROCESSOR_1/clock_module_0/aclk]


##############################################################################
#                                                                            #
#                          CREATE PATH GROUPS                                #
#                                                                            #
##############################################################################

#group_path -name REGOUT      -to   [all_outputs] 
#group_path -name REGIN       -from [remove_from_collection [all_inputs] [get_ports dco_clk]]
#group_path -name FEEDTHROUGH -from [remove_from_collection [all_inputs] [get_ports dco_clk]] -to [all_outputs]


##############################################################################
#                                                                            #
#                          BOUNDARY TIMINGS                                  #
#                                                                            #
##############################################################################
# NOTE: There are some path through between Program/Data memory signals
#      which are limiting the maximum frequency achievable by the core.
#       The memory constraints set on these interfaces are therefore quite
#      critical regarding the achievable performance of the core.
#       As a consequence, the constrains on the pmem_*/dmem_* signals must
#      be set with some absolute values as they are specified by the targeted
#      process RAM/ROM generator.

#================#
# PROGRAM MEMORY #
#================#

set PMEM_DOUT_DLY    2.25

set PMEM_ADDR_DLY    0.64
set PMEM_CEN_DLY     0.63
set PMEM_DIN_DLY     0.39
set PMEM_WEN_DLY     0.44

set_input_delay  $PMEM_DOUT_DLY            -max -clock "dco_clk"  [get_ports pmem_dout]
set_input_delay  0                         -min -clock "dco_clk"  [get_ports pmem_dout]

set_output_delay $PMEM_ADDR_DLY -add_delay -max -clock "dco_clk"  [get_ports pmem_addr]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports pmem_addr]

set_output_delay $PMEM_CEN_DLY  -add_delay -max -clock "dco_clk"  [get_ports pmem_cen]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports pmem_cen]

set_output_delay $PMEM_DIN_DLY  -add_delay -max -clock "dco_clk"  [get_ports pmem_din]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports pmem_din]

set_output_delay $PMEM_WEN_DLY  -add_delay -max -clock "dco_clk"  [get_ports pmem_wen]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports pmem_wen]


#================#
# DATA MEMORY    #
#================#

set DMEM_DOUT_DLY    2.25

set DMEM_ADDR_DLY    0.64
set DMEM_CEN_DLY     0.63
set DMEM_DIN_DLY     0.39
set DMEM_WEN_DLY     0.44


set_input_delay $DMEM_DOUT_DLY             -max -clock "dco_clk"  [get_ports dmem_dout]
set_input_delay 0                          -min -clock "dco_clk"  [get_ports dmem_dout]

set_output_delay $DMEM_ADDR_DLY -add_delay -max -clock "dco_clk"  [get_ports dmem_addr]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports dmem_addr]

set_output_delay $DMEM_CEN_DLY  -add_delay -max -clock "dco_clk"  [get_ports dmem_cen]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports dmem_cen]

set_output_delay $DMEM_DIN_DLY  -add_delay -max -clock "dco_clk"  [get_ports dmem_din]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports dmem_din]

set_output_delay $DMEM_WEN_DLY  -add_delay -max -clock "dco_clk"  [get_ports dmem_wen]
set_output_delay 0                         -min -clock "dco_clk"  [get_ports dmem_wen]


#==========================#
# REMAINING INPUT PORTS    #
#==========================#

set IRQ_DLY          [expr ($CLOCK_PERIOD/100) * 30]
set PER_DOUT_DLY     [expr ($CLOCK_PERIOD/100) * 20]


set_input_delay $IRQ_DLY       -max -clock "dco_clk"  [get_ports irq]
set_input_delay 0              -min -clock "dco_clk"  [get_ports irq]

set_input_delay $PER_DOUT_DLY  -max -clock "dco_clk"  [get_ports per_dout]
set_input_delay 0              -min -clock "dco_clk"  [get_ports per_dout]


#=========================#
# REMAINING OUTPUT PORTS  #
#=========================#

set ACLK_EN_DLY      [expr ($CLOCK_PERIOD/100) * 85]
set SMCLK_EN_DLY     [expr ($CLOCK_PERIOD/100) * 85]
set DBG_FREEZE_DLY   [expr ($CLOCK_PERIOD/100) * 85]
set IRQ_ACC_DLY      [expr ($CLOCK_PERIOD/100) * 60]

set PER_ADDR_DLY     [expr ($CLOCK_PERIOD/100) * 25]
set PER_DIN_DLY      [expr ($CLOCK_PERIOD/100) * 25]
set PER_WEN_DLY      [expr ($CLOCK_PERIOD/100) * 25]
set PER_EN_DLY       [expr ($CLOCK_PERIOD/100) * 25]

set PUC_DLY          [expr ($CLOCK_PERIOD/100) * 75]


set_output_delay $ACLK_EN_DLY    -add_delay -max -clock "dco_clk"             [get_ports aclk_en]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports aclk_en]

set_output_delay $SMCLK_EN_DLY   -add_delay -max -clock "dco_clk"             [get_ports smclk_en]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports smclk_en]

set_output_delay $DBG_FREEZE_DLY -add_delay -max -clock "dco_clk"             [get_ports dbg_freeze]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports dbg_freeze]

set_output_delay $IRQ_ACC_DLY    -add_delay -max -clock "dco_clk"             [get_ports irq_acc]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports irq_acc]


set_output_delay $PER_ADDR_DLY   -add_delay -max -clock "dco_clk"             [get_ports per_addr]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports per_addr]

set_output_delay $PER_DIN_DLY    -add_delay -max -clock "dco_clk"             [get_ports per_din]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports per_din]

set_output_delay $PER_WEN_DLY    -add_delay -max -clock "dco_clk"             [get_ports per_we]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports per_we]

set_output_delay $PER_EN_DLY     -add_delay -max -clock "dco_clk"             [get_ports per_en]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports per_en]

set_output_delay $PUC_DLY        -add_delay -max -clock "dco_clk"             [get_ports puc_rst]
set_output_delay 0                          -min -clock "dco_clk"             [get_ports puc_rst]


#========================#
# FEEDTHROUGH EXCEPTIONS #
#========================#

#set_max_delay [expr 2.0 + $DMEM_DOUT_DLY + $DMEM_ADDR_DLY] \
#              -from       [get_ports dmem_dout]            \
#              -to         [get_ports dmem_addr]            \
#              -group_path FEEDTHROUGH


#===============#
# FALSE PATHS   #
#===============#
# The following signals are internaly synchronized to
# the dco_clk domain and can be set as false path.


#set_false_path -from nmi
#set_false_path -from reset_n

#set_false_path -from OEN_pin
set_false_path -from [get_ports reset_n]
#set_multicycle_path -hold 1        -from PROCESSOR_1/execution_unit_0/mdb_in_buf*
set_false_path    -from PROCESSOR_1/frontend_0/dbg_halt_st -to PROCESSOR_1/frontend_0/\e_state_reg[1]  


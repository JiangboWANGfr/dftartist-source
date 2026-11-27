set CLOCK_PERIOD 10.0; # 100 MHz
#set CLOCK_PERIOD  8.0; # 125 MHz

create_clock -name     "INCLK"                              \
             -period    10ns                        \
             -waveform "0 5" \
             [get_ports REF_CLK]

create_clock -name     "REF_CLK"                              \
             -period    48ns                        \
             -waveform "0 24" \
             [get_ports REF_CLK]


create_generated_clock \
  -name pll_gen_clk \
  -source [get_ports REF_CLK] \
  -multiply_by 16 \
  [get_pins PLL_1/pll_clock_0]



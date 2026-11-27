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


create_clock -name     "clk"                              \
             -period   "$CLOCK_PERIOD"                        \
             -waveform "[expr $CLOCK_PERIOD/2] $CLOCK_PERIOD" \
             [get_ports clk]


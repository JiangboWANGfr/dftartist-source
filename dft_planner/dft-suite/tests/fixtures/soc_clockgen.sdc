# tests/fixtures/soc_clockgen.sdc — stress-test fixture for the SDC clock-generation feature
# (Milestone 4 of the parse_sdc_to_yaml port): several create_generated_clock variants exercised
# against a design (soc_clockgen.v) whose ports are real, a genuinely nonexistent port to prove
# SDC-EMPTY-MATCH still fires under real load, and PAD/DFT-clock-named targets to exercise the
# add_clock auto-comment logic. Each generated clock targets its OWN port so the keep-last-per-
# object dedup pass never fires between these independent scenarios.

create_clock -name CLK -period 10 [get_ports clk]
# A multi-port collection, on ports CLK does not own -- kept off `clk` itself so it cannot
# become a second candidate for the -source-based master inference test below.
create_clock -name IO_CLK -period 25 -add [get_ports {rst_n scan_clk}]

# Explicit -master_clock + -divide_by: period = 10 * 2 = 20.
create_generated_clock -name GEN_EXPLICIT -source [get_ports clk] -master_clock CLK \
    -divide_by 2 [get_ports out_explicit]

# No -master_clock: inferred from -source (clk is CLK's own object). period = 10 * 4 = 40.
create_generated_clock -name GEN_INFERRED -source [get_ports clk] \
    -divide_by 4 [get_ports out_inferred]

# -multiply_by: period = 10 / 2 = 5.
create_generated_clock -name GEN_MULT -source [get_ports clk] -master_clock CLK \
    -multiply_by 2 [get_ports out_mult]

# -edges {1 3}: half-period span (3-1)/2 = 1 cycle -> period = 10.
create_generated_clock -name GEN_EDGES -source [get_ports clk] -master_clock CLK \
    -edges {1 3} [get_ports out_edges]

# -combinational: period == master's == 10.
create_generated_clock -name GEN_COMB -source [get_ports clk] -master_clock CLK \
    -combinational [get_ports out_comb]

# PAD-named target: add_clock is generated but commented out.
create_generated_clock -name GEN_PAD -source [get_ports clk] -master_clock CLK \
    -divide_by 1 [get_ports TEST_PAD]

# DFT-infrastructure clock name (matches edt_clk|tck|clockdr): commented out.
create_generated_clock -name chip_tck -source [get_ports clk] -master_clock CLK \
    -divide_by 1 [get_ports tck_out]

# A clock on a port that does not exist in this design at all.
create_clock -name BAD_CLK -period 5 [get_ports nosuch_port]

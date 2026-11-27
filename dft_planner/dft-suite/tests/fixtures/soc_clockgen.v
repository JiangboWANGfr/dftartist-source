// tests/fixtures/soc_clockgen.v — dedicated design for the SDC clock-generation stress test
// (sdc-clockgen e2e spec). A distinct top-level port per create_generated_clock scenario so the
// clockgen keep-last-per-object dedup pass never fires between scenarios that are meant to be
// independent; soc.v/soc.f stay untouched since 19+ other specs depend on their exact shape.
module soc_clockgen(
  input  clk,
  input  rst_n,
  input  scan_clk,
  output out_explicit,
  output out_inferred,
  output out_mult,
  output out_edges,
  output out_comb,
  output TEST_PAD,
  output tck_out
);
  assign out_explicit = clk;
  assign out_inferred = clk;
  assign out_mult     = clk;
  assign out_edges    = clk;
  assign out_comb     = clk;
  assign TEST_PAD     = clk;
  assign tck_out      = clk;
endmodule

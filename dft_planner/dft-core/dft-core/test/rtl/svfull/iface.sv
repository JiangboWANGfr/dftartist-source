// Kitchen-sink SystemVerilog, part 2/3: interfaces, modports, clocking blocks, concurrent
// assertions, checkers, programs, user-defined nettypes.

interface scan_if #(parameter int W = 8) (input logic clk);
  logic         se;
  logic [W-1:0] si, so;

  clocking cb @(posedge clk);
    default input #1step output #0;
    output se, si;
    input  so;
  endclocking

  modport dut(input clk, se, si, output so);
  // a clocking block must be exported to be reachable, and declared before the modport
  modport tb(clocking cb, input clk);


  property p_se_stable;
    @(posedge clk) $rose(se) |-> ##[1:3] $stable(se);
  endproperty
  a_se: assert property (p_se_stable);

  sequence s_two_cycles;
    se ##1 se;
  endsequence
  c_se: cover property (@(posedge clk) s_two_cycles);
endinterface

checker chk_no_x(logic clk, logic sig);
  default clocking @(posedge clk);
  endclocking
  a_no_x: assert property (!$isunknown(sig));
endchecker

program automatic test_prog(scan_if.tb bus);
  initial begin
    bus.cb.se <= 1'b1;
    repeat (2) @(bus.cb);
    bus.cb.se <= 1'b0;
  end
endprogram

// user-defined nettype with a resolution function (1800-2012)
typedef real real_vec_t[2];
function automatic real_vec_t res_sum(input real_vec_t drivers[]);
  real_vec_t r = '{0.0, 0.0};
  foreach (drivers[i]) begin
    r[0] += drivers[i][0];
    r[1] += drivers[i][1];
  end
  return r;
endfunction
nettype real_vec_t analog_net with res_sum;

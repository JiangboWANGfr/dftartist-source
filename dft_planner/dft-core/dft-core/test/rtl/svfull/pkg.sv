// Kitchen-sink SystemVerilog, part 1/3: package-level type system, classes, randomization,
// functional coverage, DPI. Nothing here is hardware — it is the part of the language a
// netlist-oriented tool is most likely to choke on, which is exactly why it is in the corpus.
package dft_pkg;

  typedef enum logic [1:0] {IDLE = 2'b00, SHIFT = 2'b01, CAPTURE = 2'b10} state_e;

  typedef struct packed {
    logic [7:0] addr;
    logic [7:0] data;
  } bus_t;

  typedef struct {
    string name;
    int    width;
  } port_desc_t;  // unpacked struct

  typedef union packed {
    bus_t       b;
    logic [15:0] raw;
  } bus_u;

  typedef union tagged {
    void     Invalid;
    int      Valid;
  } maybe_int_t;

  typedef logic [3:0] nibble_t;
  typedef nibble_t    nib_q_t[$];   // queue
  typedef int         map_t[string];  // associative array
  typedef byte        dyn_t[];      // dynamic array

  parameter int WIDTH = 8;
  typedef logic [WIDTH-1:0] word_t;

  function automatic int clog2s(input int value);
    int r = 0;
    for (int v = value - 1; v > 0; v >>= 1) r++;
    return r;
  endfunction

  // parameterized virtual base + pure virtual + static member
  virtual class base_item #(parameter int W = 8);
    static int count;
    rand bit [W-1:0] payload;
    rand bit         parity;
    constraint c_parity {parity == ^payload;}
    pure virtual function string kind();
    function new();
      count++;
    endfunction
  endclass

  // inheritance, randc, soft/inside constraints, embedded covergroup
  class scan_item #(parameter int W = 8) extends base_item #(W);
    randc bit [1:0] mode;
    constraint c_mode {mode inside {[0 : 2]};}
    constraint c_soft {soft payload != '0;}  // `soft` is illegal on a randc variable
    covergroup cg_mode;
      cp_mode: coverpoint mode {
        bins lo = {0};
        bins hi = {[1 : 2]};
      }
      cp_par: coverpoint parity;
      x_mode_par: cross cp_mode, cp_par;
    endgroup
    function new();
      super.new();
      cg_mode = new();
    endfunction
    virtual function string kind();
      return "scan";
    endfunction
  endclass

  // queues / associative / dynamic arrays + foreach + array methods
  function automatic int sum_q(nib_q_t q);
    int total = 0;
    foreach (q[i]) total += q[i];
    return total;
  endfunction

  import "DPI-C" function int dft_hash(input int a);
  export "DPI-C" function dft_seed;
  function void dft_seed(int s);
  endfunction

endpackage

// Fixture for M1 navigation and detail queries. Covers acceptance scenarios
// A04 (declared ranges), A07 (parameters, instance arrays, generate), A08 (escaped
// identifiers, several tops). Expected results are written by hand in
// tests/unit/NavTest.cpp; the comments here say what each construct is for.

// ---- A04: declared ranges ---------------------------------------------------------
module ranges(
    input  logic [15:8]      up,        // descending, not ending at 0
    input  logic [0:7]       rev,       // ascending
    input  logic             bit1,      // scalar
    input  logic [1:0][3:0]  packed2,   // two packed dimensions, 8 bits
    input  logic [7:0]       mem [0:3], // unpacked array of 4, 32 bits
    input  logic signed [3:0] sgn,
    output logic [3:0]       q,
    inout  wire              io);
  assign q = up[11:8];
endmodule

// ---- A07: parameters --------------------------------------------------------------
module leaf #(parameter int W = 4, parameter type T = logic, localparam int W2 = W * 2)
             (input logic [W-1:0] d, output logic [W-1:0] q);
  parameter int BODY = 7;               // declared in the body, not the port list
  assign q = d;
endmodule

// ---- A07: instance arrays and generate ----------------------------------------------
module gen #(parameter bit FAST = 0)(input logic [3:0] d, output logic [3:0] q);
  logic [3:0] t [4];

  leaf u_first(.d, .q(t[0]));                       // slot 0

  if (FAST) begin : g_sel                          // same block name in both branches
    leaf #(.W(4)) u(.d, .q(t[1]));                  // slot 1 when FAST
  end
  else begin : g_sel
    leaf #(.W(4)) u(.d, .q(t[1]));                  // slot 1 when !FAST
    leaf #(.W(4)) extra(.d, .q());                  // slot 2 when !FAST
  end

  for (genvar i = 0; i < 2; i++) begin : g_loop   // g_loop[0], g_loop[1]
    if (i == 1) begin : g_inner                   // nested, only in iteration 1
      leaf #(.W(4)) u(.d, .q(t[2]));
    end
    leaf #(.W(4)) v(.d, .q());
  end

  if (1) begin                                    // unnamed: genblk3
    leaf #(.W(4)) anon(.d, .q());
  end

  leaf #(.W(4)) arr [3:1] (.d, .q());               // arr[1], arr[2], arr[3]
  leaf #(.W(4)) grid [1:0][0:1] (.d, .q());         // two dimensions

  assign q = t[0];
endmodule

// ---- interface, blackbox, primitive -------------------------------------------------
interface bus_if #(parameter int W = 8);
  logic [W-1:0] data;
  modport rd(input data);
endinterface

module if_user(bus_if.rd b, output logic y);
  assign y = ^b.data;
endmodule

module misc(input logic a, input logic b, output logic y, output logic z);
  bus_if #(16) bus();
  if_user iu(.b(bus), .y(z));
  missing_cell bb(.A(a), .B(b), .Y());           // never defined: blackbox
  and g1(y, a, b);                               // primitive gate
endmodule

// ---- A08: escaped identifiers, several tops ------------------------------------------
module \esc.mod (input logic a, output logic y);
  assign y = a;
endmodule

module top_b(input logic [3:0] d, output logic [3:0] q, output logic y);
  gen #(.FAST(0)) g0(.d, .q);
  gen #(.FAST(1)) g1(.d, .q());
  leaf #(.W(4))   same_as_default(.d, .q());      // overrides W with its default value
  leaf            plain(.d, .q());                // no override; same body as the above
  leaf #(.W(8), .T(int)) wide(.d({d, d}), .q());
  \esc.mod  \inst.with.dots (.a(d[0]), .y);
  \esc.mod  plain_name(.a(d[0]), .y());
endmodule

module top_a(input logic a, input logic b, output logic y, output logic z);
  misc m(.a, .b, .y, .z);
  ranges r(.up('0), .rev('0), .bit1(a), .packed2('0), .mem('{default: '0}), .sgn('0), .q(), .io());
endmodule

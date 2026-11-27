// Cases where two instances of the same module with the same parameters must NOT be
// treated as having the same body, or where it is easy to wrongly think they differ.
// Used by `hier_exp sharing` (docs/DESIGN.md 4.1, verification item V1).

// --- 1. upward reference: `cfg` resolves to a different object per parent ---
module up_leaf(output logic y);
  assign y = cfg.value;          // upward hierarchical name, resolved through the parent
endmodule
module up_parent_a(output logic y);
  cfg_one cfg();
  up_leaf u(.y);
endmodule
module up_parent_b(output logic y);
  cfg_wide cfg();
  up_leaf u(.y);
endmodule
module cfg_one;  logic       value; endmodule
module cfg_wide; logic [3:0] value; endmodule

// --- 2. defparam aimed at one of two otherwise identical instances ---
module dp_leaf #(parameter int W = 2)(output logic [W-1:0] y);
  assign y = '0;
endmodule
module dp_mid(output logic [7:0] y);
  dp_leaf u(.y(y[1:0]));
endmodule

// --- 3. bind into one of two otherwise identical instances ---
module bind_target(input logic a, output logic y);
  assign y = a;
endmodule
module bound_checker(input logic a);
  logic seen;
  assign seen = a;
endmodule

// --- 4. interface ports: same module, interfaces with different parameters ---
interface bus_if #(parameter int W = 8);
  logic [W-1:0] data;
endinterface
module if_user(bus_if b, output logic y);
  assign y = ^b.data;
endmodule

// --- 5. hierarchical assignment from outside into one instance ---
module ha_leaf(output logic y);
  logic poke;
  assign y = poke;
endmodule

// --- 6. same value reached through different override expressions (must share) ---
module pv_leaf #(parameter int W = 1)(output logic [W-1:0] y);
  assign y = '0;
endmodule

// --- 7. generate branch chosen by parameter ---
module gen_leaf #(parameter bit FAST = 0)(input logic a, output logic y);
  if (FAST) begin : g
    assign y = a;
  end
  else begin : g
    logic t;
    assign t = ~a;
    assign y = ~t;
  end
endmodule

module top;
  logic [15:0] o;
  logic a;

  up_parent_a upa(.y(o[0]));
  up_parent_b upb(.y(o[1]));

  dp_mid dpa(.y());
  dp_mid dpb(.y());
  defparam dpb.u.W = 2;          // same value as the default, but still an override target
  dp_mid dpc(.y());
  defparam dpc.u.W = 1;

  bind_target bta(.a, .y(o[2]));
  bind_target btb(.a, .y(o[3]));
  bind top.btb bound_checker chk(.a);

  bus_if #(8)  bus8a();
  bus_if #(8)  bus8b();
  bus_if #(16) bus16();
  if_user iu8a(.b(bus8a), .y(o[4]));
  if_user iu8b(.b(bus8b), .y(o[5]));
  if_user iu16(.b(bus16), .y(o[6]));

  ha_leaf haa(.y(o[7]));
  ha_leaf hab(.y(o[8]));
  assign hab.poke = a;

  localparam int ONE_A = 1;
  localparam int ONE_B = 2 - 1;
  pv_leaf #(ONE_A) pva(.y(o[9]));
  pv_leaf #(ONE_B) pvb(.y(o[10]));
  pv_leaf #(2)     pvc(.y(o[12:11]));

  gen_leaf #(0) gla(.a, .y(o[13]));
  gen_leaf #(0) glb(.a, .y(o[14]));
  gen_leaf #(1) glc(.a, .y(o[15]));
endmodule

// Independent M3 KATs: relationships below are hand-written in the tests.
module m3_leaf(input wire [1:0] d, output wire [1:0] y);
  assign y = d;
endmodule

module flow(input wire [3:0] a, b, input wire sel,
            output wire [3:0] gate, choice, joined, shifted, total, inverted,
            output wire [3:0] extended, truncated, constant_value,
            output wire reduced, output logic procedural);
  assign gate = a & b;
  assign choice = sel ? a : b;
  assign joined = {a[1:0], b[1:0]};
  assign shifted = a << 1;
  assign total = a + b;
  assign inverted = ~a;
  assign extended = a[1:0];
  assign truncated = {a, b};
  assign constant_value = 4'b10xz;
  assign reduced = &a;
  always_comb procedural = sel ? a[0] : b[0];
  wire initialized = a[0] ^ b[0];
  wire [1:0] leaf_y;
  m3_leaf u(.d(a[1:0] ^ b[1:0]), .y(leaf_y));
endmodule

module bit_paths(input wire [1:0] a, output wire [1:0] b, c);
  assign b = a;
  assign c = {b[0], b[1]};
endmodule

module combination_loop;
  wire a, b;
  assign a = b;
  assign b = a;
endmodule

module feedback(input wire clk, rst_n, d, output logic q);
  wire next_value = q ^ d;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 1'b0;
    else q <= next_value;
endmodule

module multiple(input wire a, b, output wire y);
  assign y = a;
  assign y = b;
endmodule

module hierarchy(input wire [1:0] a, output wire [1:0] y);
  m3_leaf first(.d(a), .y(y));
endmodule

module fan_leaf #(parameter int TAG=0)(input wire d, output wire y);
  assign y = d;
endmodule
module fanout(input wire a, output wire [11:0] y);
  for (genvar k=0; k<12; k++) begin : g
    fan_leaf #(.TAG(k)) u(.d(a), .y(y[k]));
  end
endmodule

module box_boundary(input wire a, output wire y);
  absent_m3 box(.A(a), .Y(y), .EMPTY());
endmodule
module primitive_boundary(input wire a, output wire y);
  not gate(y, a);
endmodule
module primitive_path(input wire a, output wire y);
  buf gate(y, a);
endmodule

// C-46 hand-written value-projection inputs.
module expr_first(output wire a, b);
  assign {a, b} = 2'b01;
endmodule
module expr_second(output wire a, b);
  assign {b, a} = 2'b01;
endmodule
module expr_nested(output wire [7:4] q, output wire s);
  assign {q[7:6], {s, q[5:4]}} = 5'b10101;
endmodule
module expr_shift(input wire [3:0] a, output wire [7:0] y);
  assign y[6:3] = a << 1;
endmodule
module no_path(input wire a, output wire y);
  assign y = 1'b0;
endmodule
module external_leaf;
  wire s;
endmodule
module external_boundary(output wire y);
  external_leaf first(), second();
  assign y = second.s;
endmodule
interface m3_iface;
  logic s;
endinterface
module interface_boundary;
  m3_iface bus();
endmodule
module opaque_boundary;
  string label;
endmodule

// A million-bit identity must stay one interval, not one million map entries.
module wide_bus(input wire [1048575:0] a, output wire [1048575:0] y);
  assign y = a;
endmodule

// B handwritten §4.4 cases; no A fixture or implementation-derived expected data.
module B_range(input logic [1:0] row, input logic [2:0] col, input logic [1:0] d,
  input logic other, output logic [3:0][7:0] matrix, output logic plain);
  always_comb begin matrix[row][col +: 2] = d; plain = other; end
endmodule
// Two real occurrences of every body exercise actual sharing, not only mode flags.
module B_m7_top(input logic [1:0] row, input logic [2:0] col,
  input logic [1:0] d, input logic other);
  B_range B_range0(.row(row), .col(col), .d(d), .other(other));
  B_range B_range1(.row(row), .col(col), .d(d), .other(other));
  B_element B_element0(.row(row), .col(col), .d(d[0]), .other(other));
  B_element B_element1(.row(row), .col(col), .d(d[0]), .other(other));
  B_constant_slice B_constant_slice0(.row(row), .d(d), .other(other));
  B_constant_slice B_constant_slice1(.row(row), .d(d), .other(other));
  B_concat B_concat0(.ia(row), .ib(col[1:0]), .d(d), .other(other));
  B_concat B_concat1(.ia(row), .ib(col[1:0]), .d(d), .other(other));
  B_member B_member0(.row(row), .d(d), .other(other));
  B_member B_member1(.row(row), .d(d), .other(other));
endmodule
module B_element(input logic [1:0] row, input logic [2:0] col, input logic d,
  input logic other, output logic [3:0][7:0] matrix, output logic plain);
  always_comb begin matrix[row][col] = d; plain = other; end
endmodule
module B_constant_slice(input logic [1:0] row, input logic [1:0] d,
  input logic other, output logic [3:0][7:0] matrix, output logic plain);
  always_comb begin matrix[row][3:2] = d; plain = other; end
endmodule
module B_concat(input logic [1:0] ia, ib, input logic [1:0] d, input logic other,
  output logic [3:0] a, b, output logic plain);
  always_comb begin {a[ia], b[ib]} = d; plain = other; end
endmodule
module B_member(input logic [1:0] row, input logic [1:0] d, input logic other,
  output logic plain);
  typedef struct packed { logic [1:0] high; logic [1:0] low; } cell_t;
  cell_t [3:0] cells;
  always_comb begin cells[row].low = d; plain = other; end
endmodule

// Hand-written reductions of dynamic memory writes emitted by Chisel.
module dynamic_nested_range(input logic clk, input logic [1:0] address,
                            input logic [3:0] data,
                            output logic [3:0] unrelated,
                            output logic [3:0] memory [0:3]);
  always @(posedge clk) begin
    unrelated <= data;
    memory[address][0 +: 2] <= data[1:0];
    memory[address][2 +: 2] <= data[3:2];
  end
endmodule

module dynamic_concat(input logic clk, input logic [1:0] a, b,
                      input logic [7:0] data,
                      output logic [3:0] unrelated,
                      output logic [3:0] left_mem [0:3], right_mem [0:3]);
  always @(posedge clk) begin
    unrelated <= data[3:0];
    {left_mem[a], right_mem[b]} <= data;
  end
endmodule

module dynamic_nested_element(input logic clk, input logic [1:0] row, col,
                              input logic [3:0] data,
                              output logic [3:0] matrix [0:3][0:3]);
  always @(posedge clk) matrix[row][col] <= data;
endmodule

module dynamic_element(input logic clk, input logic [1:0] address,
                       input logic [3:0] data,
                       output logic [3:0] unrelated,
                       output logic [3:0] memory [0:3]);
  always @(posedge clk) begin
    unrelated <= data;
    memory[address] <= data;
  end
endmodule

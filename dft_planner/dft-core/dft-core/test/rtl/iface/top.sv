interface simple_if;
  logic req;
  logic ack;
  logic [7:0] data;
  modport master(output req, input ack, output data);
  modport slave(input req, output ack, input data);
endinterface

module sub(simple_if.slave s, input logic clk);
endmodule

module top;
  simple_if bus();
  sub u_sub(bus.slave, 1'b0);
endmodule

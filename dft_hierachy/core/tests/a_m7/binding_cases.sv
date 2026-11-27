module schedule_leaf(input wire [7:0] a, output wire [7:0] y);
  assign y = a;
endmodule

module schedule_top(input wire clk, input wire [7:0] a, output wire [7:0] y);
  wire [7:0] n = a;
  logic [7:0] q;
  schedule_leaf first(.a(a ^ 8'h0f), .y(n));
  assign y = n;
  if (1) begin : chosen
    wire [7:0] g = a;
    schedule_leaf inside_leaf(.a(g + 8'd1), .y(n));
    for (genvar j = 0; j < 2; j++) begin : nested
      schedule_leaf pair[1:0](.a(a), .y(n));
    end
  end else begin : absent
    schedule_leaf unused(.a(a), .y(n));
  end
  always_ff @(posedge clk) q <= a;
  schedule_leaf direct_array[1:0](.a(a), .y(n));
  for (genvar k = 0; k < 3; k++) begin : looped
    wire [7:0] local_net = a;
    assign local_net = a;
    schedule_leaf u(.a(local_net ^ 8'hff), .y(n));
  end
  case (2)
    1: begin : no_case schedule_leaf unused(.a(a), .y(n)); end
    2: begin : case_taken schedule_leaf u(.a(a), .y(n)); end
  endcase
  buf primitive_gate(y[0], a[0]);
endmodule

module schedule_blackboxes(input wire [7:0] a, output wire [7:0] y);
  wire [7:0] n = a;
  absent_cell direct_cell(.A(a + 8'd1), .Y(n));
  assign y = n;
  for (genvar k = 0; k < 2; k++) begin : generated
    absent_cell u(.A(a ^ 8'hff), .Y(n));
  end
endmodule

module schedule_no_slots(input wire a, output wire y);
  wire n = a;
  assign y = n;
endmodule

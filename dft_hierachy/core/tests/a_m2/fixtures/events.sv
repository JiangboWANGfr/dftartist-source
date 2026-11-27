module event_classification(input logic clk, rst_n, en,
                            input logic [3:0] d, output logic [3:0] q);
  // Reset listed first; a nested clock condition is not an asynchronous event.
  always @(negedge rst_n or posedge clk) begin
    if (!rst_n) q <= 4'b0010;
    else begin
      if (en) begin
        if (clk) q <= d;
      end
    end
  end
endmodule

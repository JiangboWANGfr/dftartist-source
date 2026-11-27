module partial_tail_top(input logic in, output wire out);
  if (1) begin : root
    for (genvar i = 0; i < 24; ++i) begin : bank
      if (1) begin : s0
        if (1) begin : s1
          if (1) begin : s2
            if (1) begin : s3
              if (1) begin : s4
                if (1) begin : s5
                  logic value;
                  assign value = in;
                end
              end
            end
          end
        end
      end
    end
  end
  assign out = in;
endmodule

module analysis_leaf(input logic [31:0] a, output logic [31:0] y, output wire [31:0] z);
    for (genvar i = 0; i < 32; i++) begin : g
        assign z[i] = a[i];
        always_comb y[i] = ~a[i];
    end
endmodule
module analysis_wrap(input logic [31:0] a, output wire [31:0] y, z);
    analysis_leaf leaf(a, y, z);
endmodule
module analysis_top(input logic [31:0] a, output wire [31:0] y, z, yy, zz);
    analysis_wrap first(a, y, z);
    analysis_wrap second(a, yy, zz);
endmodule

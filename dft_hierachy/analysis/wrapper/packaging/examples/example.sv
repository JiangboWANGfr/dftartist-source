module wrapper_example(input logic c, r, d, output logic a, b);
 always_ff @(posedge c or negedge r) if(!r) a <= 0; else a <= d;
 always_ff @(posedge c or posedge r) if(r) b <= 0; else b <= d;
endmodule

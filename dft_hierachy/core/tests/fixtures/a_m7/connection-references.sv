module reference_bridge(.A(shared), .B(shared));
 inout wire shared;
endmodule
module reference_top(input wire a);
 for(genvar n=0;n<16;n++) begin : bank
 wire sink;
 reference_bridge bridge(.A(a),.B(sink));
 reference_observer observer(.A(sink));
 end
endmodule

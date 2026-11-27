// B56 independent RTL objects: 7 instances, 21 ports, 32 signals.
module K_leaf #(parameter W=3)(input wire[W-1:0] a, output wire[W-1:0] y, inout wire z);
 wire[W:0] lane; reg[1:0] state;
 assign lane={1'b0,a}; assign y=lane[W-1:0];
endmodule
module K_wrap(input wire[2:0] a,output wire[2:0] y,inout wire z);
 K_leaf x(.a(a),.y(y),.z(z));
endmodule
module K_top(input wire[2:0] a,output wire[2:0] y,inout wire z);
 wire[2:0] mid;
 K_wrap left(.a(a),.y(y),.z(z));
 K_leaf right(.a(a),.y(mid),.z(z));
 for(genvar i=0;i<2;i++)begin: group
  K_leaf #(.W(i+2)) gen(.a(a),.y(),.z(z));
 end
 K_leaf \odd.name (.a(a),.y(),.z(z));
endmodule
module K_empty; endmodule
module K_opaque(input wire a,output wire y);
 K_missing mystery(.i(a),.o(y));
endmodule

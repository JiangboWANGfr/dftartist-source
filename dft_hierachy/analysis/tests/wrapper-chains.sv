module chain_top(input logic c,input logic [3:0] d,output logic [3:0] q,
                 output wire [3:0] alias_q,output wire pass,constant_o);
 always_ff @(posedge c) q<=d;
 assign alias_q=q;assign pass=d[0];assign constant_o=1'b0;
endmodule
module chain_fragments(output wire a,b,input logic c,d,output logic [3:0] q);
 always_ff @(posedge c) q<={4{d}};
 assign a=q[0];assign b=q[2];
endmodule
module chain_io(inout wire [1:0] p);endmodule
module chain_unknown(output wire q);MISSING u(.Y(q));endmodule

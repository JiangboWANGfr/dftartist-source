// B53 public reproduction input, independent of the C fixture.
module E_leaf(input c,output reg q);always @(posedge c)q<=~q;endmodule
module E_wide(input c);
 for(genvar i=0;i<3072;i++)begin:row E_leaf r(c);end
endmodule

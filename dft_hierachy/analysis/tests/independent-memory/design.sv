module B57Bank #(parameter AB=2, DB=6)(input [AB-1:0] ADDR,
 input [DB-1:0] WD, output [DB-1:0] RD, input CLK, WE, input [1:0] BE);
 assign RD=WD; // Interface only: no storage-function claim.
endmodule
module B57Wrap(input [1:0] a, input [5:0] d, input c, input [1:0] m);
 B57Bank inner(.ADDR(a),.WD(d),.RD(),.CLK(c),.WE(1'b0),.BE(m));
endmodule
module B57Top(input rootc, input [1:0] addr, input [5:0] data, input [1:0] wm, output [5:0] q);
 B57Bank b0(.ADDR({addr[0],addr[1]}),.WD({data[2:0],3'b101}),.RD(q),.CLK(rootc),.WE(1'b0),.BE(wm));
 B57Bank #(.DB(3)) b1(.ADDR(addr),.WD(data[2:0]),.RD(),.CLK(rootc),.WE(1'b1),.BE(wm));
 B57Wrap w(addr,data,rootc,wm);
 for(genvar i=0;i<2;i++) begin:g
  B57Bank mem(.ADDR(addr),.WD(data),.RD(),.CLK(1'b0),.WE(1'b0),.BE(wm));
 end
 B57Bank \strange.mem (.ADDR(addr),.WD(data),.RD(),.CLK(rootc),.WE(1'b0),.BE(wm));
endmodule
module B57OpaqueTop(input c, input [1:0] a,m, input [5:0] d, output [5:0] q);
 B57Ext named(.ADDR(a),.WD(d),.RD(q),.CLK(c),.WE(1'b0),.BE(m));
endmodule
module B57PosTop(input c, input [1:0] a,m, input [5:0] d);
 B57Ext positional(a,d,,c,1'b0,m);
endmodule
module B57Empty; endmodule
// B57 minimal regression after independent reproduction of C-S2-12-01.
// Both child modules above are unchanged. Optional library must not be mandatory.
module B57MixedTop(input c, input [1:0] a,m, input [5:0] d, output [5:0] q);
 B57OpaqueTop n(c,a,m,d,q);
 B57PosTop p(c,a,m,d);
endmodule

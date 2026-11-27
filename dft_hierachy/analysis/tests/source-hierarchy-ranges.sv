module ranges_adjacent(input logic a,b,c,sel,input logic [7:0] d,output logic [7:0] q);
 wire extra=sel?c:b;
 always @(posedge a) q<=d;
 always @(posedge extra) q[3:0]<=d[3:0];
endmodule
module ranges_holes(input logic a,b,sel,input logic [7:0] d,output logic [7:0] q);
 wire selected=sel?b:a;
 always @(posedge selected) begin q[1:0]<=d[1:0];q[7:6]<=d[7:6];end
endmodule
module ranges_roles(input logic a,b,sel,input logic [7:0] d,output logic [7:0] q);
 wire low=sel?a:b;
 wire high=sel?b:a;
 always @(posedge low) q[3:0]<=d[3:0];
 always @(posedge high) q[7:4]<=d[7:4];
endmodule

module catalog_leaf #(parameter W=4)(input logic [W-1:0] a, output wire [W-1:0] y);
 wire [W-1:0] n;
 logic [W:0] state;
 assign n=a;
 assign y=n;
 always_comb state={1'b0,a};
endmodule
module catalog_top(input logic [3:0] a, output wire [3:0] y);
 wire [3:0] right_y;
 wire [3:0] array_y [1:0];
 wire [3:0] odd_y;
 logic \escaped.sig ;
 catalog_leaf left(a,y),right(a,right_y);
 for(genvar i=0;i<2;i++) begin:g
   wire [1:0] sink;
   catalog_leaf #(.W(2)) u(a[1:0],sink);
 end
 catalog_leaf pair[1:0](a,array_y);
 catalog_leaf \odd.name (a,odd_y);
 assign \escaped.sig =a[0];
endmodule
module catalog_opaque(input logic a, output wire y);
 missing_cell unknown(.A(a),.Y(y));
endmodule
module catalog_empty;
endmodule

module deep_leaf(input logic c,r,input logic [3:0] d,output logic [3:0] q);
 always @(posedge c or negedge r) if(!r) q<=0;else q<=d;
endmodule
module deep_top(input logic c0,c1,r0,sel,d,output logic [3:0] q);
 logic clock_q;wire chosen=sel?c1:c0;
 always @(posedge chosen) clock_q<=d;
 deep_leaf u(clock_q,r0,{4{d}},q);
endmodule
module deep_reset(input logic c0,r0,r1,sel,d,output logic [3:0] q);
 logic reset_q;wire chosen=sel?r1:r0;
 always @(posedge chosen) reset_q<=d;
 deep_leaf u(c0,reset_q,{4{d}},q);
endmodule
module deep_invert(input logic c0,r0,sel,d,output logic [3:0] q);
 logic clock_q;wire chosen=sel?~c0:c0;
 always @(posedge chosen) clock_q<=d;
 deep_leaf u(clock_q,r0,{4{d}},q);
endmodule
module deep_overlap_sink(input logic c,input logic [3:0] d,output logic [3:0] q);
 always @(posedge c) q[2:0]<=d[2:0];
 always @(negedge c) q[3:1]<=d[3:1];
endmodule
module deep_overlap(input logic c0,c1,sel,input logic [3:0] d,output logic [3:0] q);
 logic clock_q;wire chosen=sel?c1:c0;
 always @(posedge chosen) clock_q<=d[0];
 deep_overlap_sink u(clock_q,d,q);
endmodule
module deep_pair(input logic a,b,r,d,output logic [7:0] q);
 deep_leaf x(a,r,{4{d}},q[3:0]);deep_leaf y(b,r,{4{d}},q[7:4]);
endmodule
module deep_local(input logic c0,c1,r0,sel,d,output logic [7:0] q);
 logic clock_q;wire chosen=sel?c1:c0;
 always @(posedge chosen) clock_q<=d;
 deep_pair u(clock_q,c0,r0,d,q);
endmodule

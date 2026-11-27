module compatibility_top(input logic c,b,r,d,en,output logic qa,qb,qp,qc,qh,qg,qfree,output wire alias_a);
 always_ff @(posedge c or negedge r)if(!r)qa<=0;else qa<=d;
 always_ff @(posedge c or negedge r)if(!r)qb<=1;else qb<=d;
 always_ff @(posedge c or posedge r)if(r)qp<=0;else qp<=d;
 always_ff @(posedge b or negedge r)if(!r)qc<=0;else qc<=d;
 wire held_reset=c;
 always_ff @(posedge c or negedge held_reset)if(!held_reset)qh<=0;else qh<=d;
 wire gated=r&en;
 always_ff @(posedge c or negedge gated)if(!gated)qg<=0;else qg<=d;
 always_ff @(posedge c)qfree<=d;
 assign alias_a=qa;
endmodule
module compatibility_cross(input logic c,r,d,output logic a,b);
 always_ff @(posedge c or negedge r)if(!r)a<=0;else a<=d;
 always_ff @(posedge r or negedge c)if(!c)b<=0;else b<=d;
endmodule
module compatibility_bus(input logic [1:0] c,input logic d,output logic q);
 wire clk=c[0],rst=c[1];
 always_ff @(posedge clk or negedge rst)if(!rst)q<=0;else q<=d;
endmodule
module compatibility_constant(input logic c,d,output logic q);
 wire zero=1'b0;
 always_ff @(posedge c or negedge zero)if(!zero)q<=0;else q<=d;
endmodule
module compatibility_unknown_clock(input logic c,r,en,d,output logic q);
 wire gated=c&en;
 always_ff @(posedge gated or negedge r)if(!r)q<=0;else q<=d;
endmodule

module compatibility_ambiguous(input logic c,d,output logic q);
 always_ff @(posedge c or negedge c)if(!c)q<=0;else q<=d;
endmodule

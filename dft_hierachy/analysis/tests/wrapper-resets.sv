module reset_top(input logic c,rn,rp,en,d,output logic [1:0] qn,output wire [1:0] alias_n,
                 output logic qp,qi,qs,qfree,qg);
 wire inv=~rn;wire gated=rp&en;
 always_ff @(posedge c or negedge rn)if(!rn)qn<=0;else qn<={2{d}};
 always_ff @(posedge c or posedge rn)if(rn)qp<=0;else qp<=d;
 always_ff @(posedge c or posedge inv)if(inv)qi<=0;else qi<=d;
 always_ff @(posedge c or negedge rn)if(!rn)qs<=1;else qs<=d;
 always_ff @(posedge c)qfree<=d;
 always_ff @(posedge c or posedge gated)if(gated)qg<=0;else qg<=d;
 assign alias_n=qn;
endmodule
module reset_leaf(input logic c,rn,d,output logic q);
 always_ff @(posedge c or negedge rn)if(!rn)q<=0;else q<=d;
endmodule
module reset_hierarchy(input logic c,r,d,output wire q);
 wire inv=~r;reset_leaf u(.c(c),.rn(inv),.d(d),.q(q));
endmodule
module reset_vector(input logic c,r,d,output logic [3:0] q);
 always_ff @(posedge c or negedge r)if(!r)q[1:0]<=0;else q[1:0]<={2{d}};
 always_ff @(posedge c or posedge r)if(r)q[3:2]<=0;else q[3:2]<={2{d}};
endmodule
module reset_unknown(input logic c,r,en,d,output logic [2:0] q);
 wire gated=r&en;
 always_ff @(posedge c or negedge r)if(!r)q[0]<=0;else q[0]<=d;
 always_ff @(posedge c or posedge r)if(r)q[1]<=0;else q[1]<=d;
 always_ff @(posedge c or posedge gated)if(gated)q[2]<=0;else q[2]<=d;
endmodule
module reset_constant(input logic c,d,output logic qi,qa,qx);
 wire one=1'b1,zero=1'b0,unknown=1'bx;
 always_ff @(posedge c or negedge one)if(!one)qi<=0;else qi<=d;
 always_ff @(posedge c or negedge zero)if(!zero)qa<=0;else qa<=d;
 always_ff @(posedge c or negedge unknown)if(!unknown)qx<=0;else qx<=d;
endmodule
module reset_bus(input logic c,d,input logic [1:0] r,output logic [1:0] q);
 wire lo=r[0],hi=r[1];
 always_ff @(posedge c or negedge lo)if(!lo)q[0]<=0;else q[0]<=d;
 always_ff @(posedge c or posedge hi)if(hi)q[1]<=0;else q[1]<=d;
endmodule
module reset_unknown_clock(input logic c,en,rn,d,output logic q);
 wire gated=c&en;
 always_ff @(posedge gated or negedge rn)if(!rn)q<=0;else q<=d;
endmodule

module reset_unsupported(input logic c,d,input logic [1:0] r,output logic q);
 always_ff @(posedge c or negedge r[0])if(!r[0])q<=0;else q<=d;
endmodule

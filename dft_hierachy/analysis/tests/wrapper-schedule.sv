module schedule_top(input logic c,r,d,en,output logic a,b,n,i,p,f,g);
 wire invc=~c;
 always_ff @(posedge c or negedge r)if(!r)a<=0;else a<=d;
 always_ff @(posedge c or negedge r)if(!r)b<=0;else b<=d;
 always_ff @(negedge c or negedge r)if(!r)n<=0;else n<=d;
 always_ff @(posedge invc or negedge r)if(!r)i<=0;else i<=d;
 always_ff @(posedge c or posedge r)if(r)p<=0;else p<=d;
 always_ff @(posedge c)f<=d;
 wire gated=r&en;
 always_ff @(posedge c or negedge gated)if(!gated)g<=0;else g<=d;
endmodule

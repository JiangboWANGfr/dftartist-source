// Mentor Graphics simplified, jitter-free PLL model for simulation only
`celldefine
`timescale 1 ns  / 1 fs
// Parameterized PLL

// Parameters are :
//   Multiplication (integer) > 0 (not verified)
//   I/O delay (ns)
//   Locktime (us) (min is always one cycle of reference_clock clock)

// Inputs
//   reference_clock -> reference clock to multiply
//   enable - logic 1 enables to the PLL to run

// Outputs
//   pll_clock { 270, 180, 90, 0 } deg multiplied output frequency
//     I/O delay is applied modulo the full period of the output frequency.
//     Within that modulo delay, one pll_clock output is guaranteed to exhibit
//     this modulo delay.
//   LOCKED
//     Goes to 1 when PLL has locked.
//     Minimum is 2 full cycles of reference_clock.
//     Otherwise, elapsed time is checked on every falling
//     edge of reference_clock and the PLL is then enabled.
//     The LOCKED signal goes high on the 2nd rising edge of reference_clock
//     following the time when the specified locktime has elapsed.
//     pll_clock outputs are generated in the reference_clock cycle that precedes
//     the LOCKED signal being asserted.
module pll (reference_clock, pll_clock_270, pll_clock_180, pll_clock_90, pll_clock_0, LOCKED,enable);

   input  reference_clock, enable;
   output pll_clock_270, pll_clock_180, pll_clock_90, pll_clock_0;
   output LOCKED;

   parameter M = 16.0;
   parameter IODELAY_NS = 1.0;
   parameter LOCKTIME_US = 1.0;

   `ifdef LV_scanmodel
   `else 

   reg VCO4, VCO4D;
   reg EN, VCO_CPL, LOCKED;
   real edge1Time, period, vcohp, iodelay, rem;
   real firstEdgeTime, lockTime, refLockTime;
   integer MM, MU;

   reg [1:0] C0, C1, C2, C3;
   reg [3:0] pll_clock_D;

   initial begin
      EN = enable; 
      MM = 0;
      iodelay = 0.0;
      edge1Time = 0.0;
      firstEdgeTime = 0.0;
      lockTime = 0.0;
      refLockTime = 1.0 * LOCKTIME_US;
      VCO_CPL = 1'b0;
      VCO4 = 1'b0;
      //EN = 1'b0;
      @(posedge reference_clock) firstEdgeTime = $realtime;
      @(vcohp);
      @(negedge reference_clock);
      @(posedge reference_clock);
      if (refLockTime <= 0.0) begin
	 //EN = 1'b1;
	 lockTime = $realtime - firstEdgeTime;
      end
   end

   always @ ( posedge reference_clock ) begin
      period = $realtime - edge1Time;
      vcohp = 0.125 * period / M;
      edge1Time = $realtime;
	  EN <= enable;

      if (EN) begin
	 if (vcohp > 0.0) begin
            MU = $rtoi(1.0 * IODELAY_NS / vcohp);
            iodelay = IODELAY_NS - $itor(MU) * vcohp;
            if ((MU % 2) == 0) begin
               VCO_CPL = 1'b0;
            end else begin
               VCO_CPL = 1'b1;
            end
	 end else begin
	    iodelay = 0.0;
	 end

	 VCO4 = 1'b1;
	 for (MM = 4*M - 1; MM > 0; MM = MM - 1) begin
	    #(vcohp) VCO4 = ~VCO4;
	    #(vcohp) VCO4 = ~VCO4;
	 end
	 #(vcohp) VCO4 = ~VCO4;
      end else begin
	 VCO4 = 1'b0;
	 @(negedge reference_clock);
	 if (refLockTime > 0.0) begin
	    lockTime = $realtime - firstEdgeTime;
	    if (lockTime - refLockTime > 0.0) begin
               EN = 1'b1;
	    end
	 end
      end
   end

   initial begin
      C0 = 2'b11;
      C1 = 2'b10;
      C2 = 2'b01;
      C3 = 2'b00;
      pll_clock_D = 4'b0000;
      LOCKED = 1'b0;
   end

   always @(posedge C3[1]) pll_clock_D[3] = EN;
   always @(posedge C2[1]) pll_clock_D[2] = EN;
   always @(posedge C1[1]) pll_clock_D[1] = EN;
   always @(posedge C0[1]) pll_clock_D[0] = EN;
   always @(posedge reference_clock) LOCKED <= pll_clock_D[3];

   assign pll_clock_270 = pll_clock_D[3] & C3[1];
   assign pll_clock_180 = pll_clock_D[2] & C2[1];
   assign pll_clock_90  = pll_clock_D[1] & C1[1];
   assign pll_clock_0   = pll_clock_D[0] & C0[1];

   always @(VCO4 or VCO_CPL) begin
      #(iodelay) VCO4D = EN & (VCO4 ^ VCO_CPL);
   end

   always @(posedge VCO4D) begin
      C0 <= C0 - 2'b01;
      C1 <= C1 - 2'b01;
      C2 <= C2 - 2'b01;
      C3 <= C3 - 2'b01;
   end

   `endif
endmodule

`endcelldefine
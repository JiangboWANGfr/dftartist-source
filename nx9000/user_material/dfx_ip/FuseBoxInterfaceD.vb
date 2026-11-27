//
//  This material contains trade secrets or otherwise confidential                                                       
//  information owned by Siemens Industry Software Inc. or its affiliates                                                    
//  (collectively, "SISW"), or its licensors. Access to and use of this                                                     
//  information is strictly limited as set forth in the Customer's                                                        
//  applicable agreements with SISW. 
//
//  Unpublished work. Copyright 2024 Siemens
//
//  Technology Release: 2024.1
 `ifdef WORDS8
   `define NWORDS 8
 `elsif WORDS16
   `define NWORDS 16
 `elsif WORDS32
   `define NWORDS 32
 `elsif WORDS64
   `define NWORDS 64
 `elsif WORDS128
   `define NWORDS 128
 `elsif WORDS256
   `define NWORDS 256
 `endif
`ifndef FUSEBOXADDRESSBITS
  `define FUSEBOXADDRESSBITS 8
`endif
`ifdef USE_SYSTEM_VERILOG_SYNTAX
  `define ALWAYS_FF_KEYWORD always_ff
`else
  `define ALWAYS_FF_KEYWORD always
`endif

module genericFuseBox #(
  parameter NWORDS = `NWORDS,
  parameter FUSEBOXADDRESSBITS = `FUSEBOXADDRESSBITS       // Number must match value specified for property FuseBoxAddressBits of ETAssemble/MemBISR wrapper
) (
`ifdef DOUBLEBIT
  `ifdef BADFUSEDETECTOR
  output reg badFuseBox,
  output reg [FUSEBOXADDRESSBITS-5:0] badFuseCount,
  input wire badFuseDetectorEnable,
  input wire [FUSEBOXADDRESSBITS-5:0] maxBadFuseCount,
  `endif
`endif
`ifdef READBUFFER
  input wire selectBuffer,
  input wire selectBuffer_TAP,
  input wire FBCtrl_en,
  `ifdef DOUBLEBIT
  output wire [16*NWORDS-1:0] fuseVector,  // Fuses available at fuse box interface output in a single vector. Temporarily set to Max FB size using double bit programming.
  `else
  output wire [32*NWORDS-1:0] fuseVector,  // Fuses available at fuse box interface output in a single vector. Temporarily set to Max FB size using double bit programming.
  `endif
`endif
  input wire clock,
  input wire [FUSEBOXADDRESSBITS-1:0] Address,
  input wire writeFB,
  input wire FBreset,
  input wire selectFB,
  input wire FBAccess,
  input wire vddq,
  input wire TM,
  output wire fuseValue,
  input wire [31:0] strobeCntVal,
  output wire doneFB
);

`ifdef DOUBLEBIT
  `ifdef BADFUSEDETECTOR
// Optional declarations for bad fuse detector
wire badFuse;
wire    [FUSEBOXADDRESSBITS-5:0] maxBadFuseCount_IC;
  `else
wire   badFuseDetectorEnable;
assign badFuseDetectorEnable = 0;
  `endif
`else
wire   badFuseDetectorEnable;
assign badFuseDetectorEnable = 0;
`endif

wire doneFB_pre;

`ifdef READBUFFER
// Optional declarations for read buffer
wire selectBuffer_muxed;
wire rowAddressSelect; 
reg FBReadComplete, doneFB_read_pulse;
assign selectBuffer_muxed = (FBCtrl_en) ? selectBuffer_TAP : selectBuffer;
`else
wire selectBuffer_muxed;
wire FBReadComplete, doneFB_read_pulse;
assign selectBuffer_muxed = 1'b0;
assign doneFB_read_pulse = 1'b0;
`endif

 
wire [31:0] fuseQ;
reg         strobeEnable;
reg  [31:0] strobeCnt;
reg	     strobeEnableD, strobeEnableR;
wire LOAD, PGENB, STROBE;
wire [31:0] fuseQ_IC;
reg [3:0] CSBPipe;

reg FBAccessDetect;
reg [2:0] FBAccess_pipe_reg;
wire FBAccess_pipe;
wire newreadword;

reg [31:0] CtlObsFB;		// Width is determined by the number of fuse box outputs
reg [5:0] fuse_dly_cnt;     // Delay counter providing setup time for PD with respect to CSB (Tsup_pd_ps)
reg [13:0] fuse_acc_dly;    // MMOD3 Delay providing setup time for PS wrt CSB (Tsup_ps_cs) and hold time of PD wrt PS (Thp_pd_ps)
parameter fuse_csb_cnt_bits=19;
reg [fuse_csb_cnt_bits-1:0] fuse_csb_cnt;    // MMOD5 Delay providing hold time for PS wrt CSB in program mode (Thp_ps_cs) and setup time in immediately following read mode (Tsur_ps_cs) 
reg [3:0] selectFB_dly;     // MMOD2 Delay providing hold time for CSB wrt STROBE (Thr_cs) 
wire start_fuse_acc;

wire trigger, delaycntZero;

reg pd_to_fuse, ps_to_fuse, csb_to_fuse;

`ALWAYS_FF_KEYWORD @ (posedge clock  or posedge FBreset) begin
   if (FBreset) begin
           pd_to_fuse  <= 1'b1;
           ps_to_fuse <= 1'b0;
           csb_to_fuse <= 1'b1;
   end else begin
           pd_to_fuse <= ((selectFB & ~selectBuffer_muxed) ? 1'b0 : ~(fuse_acc_dly[13] | start_fuse_acc));              // MMOD3
           ps_to_fuse <= fuse_csb_cnt[8] ? start_fuse_acc | fuse_acc_dly[13] : 1'b0;                                    // MMOD3
           csb_to_fuse <= ((start_fuse_acc ? ~fuse_acc_dly[9] : 1'b1) | (fuse_csb_cnt[fuse_csb_cnt_bits-1] & ~(writeFB & selectFB_dly[0])));    // MMOD5
   end
end
wire rowAddressCountFirst;

`ifdef DOUBLEBIT
// [start] : DoubleBit Enabled {{{
wire [FUSEBOXADDRESSBITS:0] fuseAdd;
wire [FUSEBOXADDRESSBITS-5:0] currentwordadd, rowAddressFBCtrl;
wire [3:0] fuseBitAdd;
wire [15:0] readBufferIn; 
reg  doneFB_wr0;
reg  [3:0] doneFB_wr0_pipe;
wire doneFB_wr0_pulse;

assign rowAddressFBCtrl =  Address[FUSEBOXADDRESSBITS-1:4] ;

  `ifdef READBUFFER
reg  [FUSEBOXADDRESSBITS-5:0] rowAddressCount;
    assign currentwordadd = rowAddressSelect ? rowAddressFBCtrl : rowAddressCount;
  `else
    assign currentwordadd = rowAddressFBCtrl ;
  `endif
reg  [FUSEBOXADDRESSBITS-4:0] lastwordadd;

    assign fuseBitAdd  = (~FBReadComplete & ~writeFB) ? 4'b0 : Address[3:0]; 
    assign fuseAdd      =  {fuseBitAdd, doneFB_wr0, currentwordadd};

    assign readBufferIn  = {fuseQ_IC[30] | fuseQ_IC[31],
                            fuseQ_IC[28] | fuseQ_IC[29],
                            fuseQ_IC[26] | fuseQ_IC[27],
                            fuseQ_IC[24] | fuseQ_IC[25],
                            fuseQ_IC[22] | fuseQ_IC[23],
                            fuseQ_IC[20] | fuseQ_IC[21],
                            fuseQ_IC[18] | fuseQ_IC[19],
                            fuseQ_IC[16] | fuseQ_IC[17],
                            fuseQ_IC[14] | fuseQ_IC[15],
                            fuseQ_IC[12] | fuseQ_IC[13],
                            fuseQ_IC[10] | fuseQ_IC[11],
                            fuseQ_IC[ 8] | fuseQ_IC[ 9],
                            fuseQ_IC[ 6] | fuseQ_IC[ 7],
                            fuseQ_IC[ 4] | fuseQ_IC[ 5],
                            fuseQ_IC[ 2] | fuseQ_IC[ 3],
                            fuseQ_IC[ 0] | fuseQ_IC[ 1]};

`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
     if (FBreset) begin
          CSBPipe <= 4'b1111;                           // MMOD4
          FBAccessDetect <= 0;
          doneFB_wr0_pipe <= 4'hf;
   end else begin
          CSBPipe <= {CSBPipe[2:0], csb_to_fuse} ;   // MMOD4
          FBAccessDetect <= ~doneFB & (FBAccessDetect | FBAccess);
          doneFB_wr0_pipe <= {doneFB_wr0_pipe[2:0],doneFB_wr0};
   end
end

`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
     if (FBreset) begin
          doneFB_wr0 <= 1;
   end   
     else if (writeFB == 1 ) begin
          doneFB_wr0 <= doneFB_pre ^ doneFB_wr0;
   end
end

assign doneFB_wr0_pulse = (doneFB_wr0_pipe[3:2] == 2'b10);


  `ifdef BADFUSEDETECTOR
// Optional code for bad fuse detector

    assign badFuse =  ((Address[3:0]==4'h0) & (fuseQ_IC[0] ^ fuseQ_IC[1])) |
                      ((Address[3:0]==4'h1) & (fuseQ_IC[2] ^ fuseQ_IC[3])) |
                      ((Address[3:0]==4'h2) & (fuseQ_IC[4] ^ fuseQ_IC[5])) |
                      ((Address[3:0]==4'h3) & (fuseQ_IC[6] ^ fuseQ_IC[7])) |
                      ((Address[3:0]==4'h4) & (fuseQ_IC[8] ^ fuseQ_IC[9])) |
                      ((Address[3:0]==4'h5) & (fuseQ_IC[10] ^ fuseQ_IC[11])) |
                      ((Address[3:0]==4'h6) & (fuseQ_IC[12] ^ fuseQ_IC[13])) |
                      ((Address[3:0]==4'h7) & (fuseQ_IC[14] ^ fuseQ_IC[15])) |
                      ((Address[3:0]==4'h8) & (fuseQ_IC[16] ^ fuseQ_IC[17])) |
                      ((Address[3:0]==4'h9) & (fuseQ_IC[18] ^ fuseQ_IC[19])) |
                      ((Address[3:0]==4'ha) & (fuseQ_IC[20] ^ fuseQ_IC[21])) |
                      ((Address[3:0]==4'hb) & (fuseQ_IC[22] ^ fuseQ_IC[23])) |
                      ((Address[3:0]==4'hc) & (fuseQ_IC[24] ^ fuseQ_IC[25])) |
                      ((Address[3:0]==4'hd) & (fuseQ_IC[26] ^ fuseQ_IC[27])) |
                      ((Address[3:0]==4'he) & (fuseQ_IC[28] ^ fuseQ_IC[29])) |
                      ((Address[3:0]==4'hf) & (fuseQ_IC[30] ^ fuseQ_IC[31])) ;

wire badFuseDetectorReset;
assign badFuseDetectorReset = FBreset & ~badFuseDetectorEnable;
`ALWAYS_FF_KEYWORD @ (posedge clock or posedge badFuseDetectorReset) begin
  if (badFuseDetectorReset) begin
    badFuseCount <= {(FUSEBOXADDRESSBITS-4){1'b0}};      
  end else begin
    if (badFuse & doneFB & ~badFuseBox & badFuseDetectorEnable) begin
      badFuseCount <= badFuseCount + 1'b1;
    end else begin
      badFuseCount <= badFuseCount;
    end
  end
end

`ALWAYS_FF_KEYWORD @ (posedge clock or posedge badFuseDetectorReset) begin
  if (badFuseDetectorReset) begin
    badFuseBox <= 1'b0;
  end else begin
    badFuseBox <= (badFuseCount > maxBadFuseCount_IC) | (maxBadFuseCount_IC == {(FUSEBOXADDRESSBITS-4){1'b1}});
  end
end

assign maxBadFuseCount_IC = TM ? badFuseCount[FUSEBOXADDRESSBITS-5:0] : maxBadFuseCount  ;

// End of additional code for bad fuse detector
  `endif
// [end]   : DoubleBit }}}
`else
// [start] : DoubleBit Disabled {{{
   wire [4:0] fuseBitAdd;
   wire [FUSEBOXADDRESSBITS-1:0] fuseAdd;
   wire [FUSEBOXADDRESSBITS-6:0] currentwordadd, rowAddressFBCtrl;
   wire [31:0] readBufferIn; 

assign rowAddressFBCtrl = Address[FUSEBOXADDRESSBITS-1:5] ;

  `ifdef READBUFFER
   reg [FUSEBOXADDRESSBITS-6:0] rowAddressCount;
   assign currentwordadd = rowAddressSelect ? rowAddressFBCtrl: rowAddressCount;               
  `else
   assign currentwordadd = rowAddressFBCtrl ;               
  `endif
   reg [FUSEBOXADDRESSBITS-5:0] lastwordadd;

   assign fuseBitAdd   = (~FBReadComplete & ~writeFB) ? 5'b0 : Address[4:0]; 
   assign fuseAdd      =  {fuseBitAdd, currentwordadd};
   assign readBufferIn = fuseQ_IC ;

`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
     if (FBreset) begin
          CSBPipe <= 4'b1111;                            // MMOD4
          FBAccessDetect <= 0;
   end else begin
          CSBPipe <= {CSBPipe[2:0], csb_to_fuse} ;    // MMOD4
          FBAccessDetect <= ~(~CSBPipe[0] & csb_to_fuse) & (FBAccessDetect | FBAccess);   // MMOD4
   end
end
// [end]   : DoubleBit Disabled }}}
`endif

// Fuse interface meant to work with clock from 50MHZ to 10MHZ. One parameter only below needs to be chosen for clock speed.
parameter TRD=244;
`ifdef FIFTYMHZ
       parameter Period = 20;
       parameter DLY_CNT_LOAD = 54;
`endif
`ifdef FORTYMHZ
       parameter Period = 25;
       parameter DLY_CNT_LOAD = 43;
`endif
`ifdef THIRTYMHZ
       parameter Period = 33;
       parameter DLY_CNT_LOAD = 32;
`endif
`ifdef TWENTYMHZ
       parameter Period = 50;
       parameter DLY_CNT_LOAD = 21;
`endif
`ifdef TENMHZ
       parameter Period = 100;
       parameter DLY_CNT_LOAD = 10;
`endif
parameter STRB_CNT_LOAD = TRD/Period;

assign  LOAD        =   ~writeFB;
assign  PGENB       =   ~writeFB;
assign  STROBE      = strobeEnableR;

// [start] : strobeCnt / strobeEnable block {{{
`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
  if (FBreset) begin
     strobeCnt <= {32{1'b0}};
     strobeEnable <= 1'b0;
   end else begin
     if (~selectFB) begin
       strobeCnt <= {32{1'b0}};
       strobeEnable <= 1'b0;
     end else begin
       if (trigger) begin
         if (writeFB) begin
            strobeCnt <= strobeCntVal;
         end else begin
            strobeCnt <=  (~newreadword) ? {32{1'b0}} : STRB_CNT_LOAD;
         end
         strobeEnable <= 1'b1;
       end else begin
         if (strobeCnt != {32 { 1'b0 } }) begin
           strobeCnt <= strobeCnt - 1;
           strobeEnable <= 1'b1;
         end else begin
           strobeEnable <= 1'b0;
         end
       end
     end
   end
end

`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
   if (FBreset) begin
	 strobeEnableD <= 1'b0;
   end else begin
     if (~selectFB) begin
    	strobeEnableD <= 1'b0;
     end else begin
    	strobeEnableD <= strobeEnable;
     end
   end
end
// [end]   : strobeCnt / strobeEnable block }}}

reg [2:0] doneFB_pre_reg;
wire doneFB_pre_reg_select;

assign doneFB_pre_reg_select = ~selectBuffer_muxed & newreadword & ~FBReadComplete;

`ALWAYS_FF_KEYWORD @(posedge clock or posedge FBreset) begin
  if ( FBreset ) begin
    doneFB_pre_reg <= 3'd0;
  end else begin 
    if ( ! doneFB_pre_reg_select ) begin
      // Clear pipeline registers when starting a new FB Access
      doneFB_pre_reg  <= 3'd0;
    end else begin
      doneFB_pre_reg  <= {doneFB_pre_reg[1:0],strobeEnableD & ~strobeEnable};
    end
  end
end
wire doneFB_int;
`ifdef READBUFFER
wire LastFBReadAccess_int;
wire FBReadComplete_int;
`endif
assign doneFB_int = writeFB ? doneFB_pre_reg[2] : (FBReadComplete ? doneFB_pre_reg[1]:doneFB_pre_reg[2]);
assign doneFB_pre = doneFB_pre_reg_select ? doneFB_int :strobeEnableD & ~strobeEnable;
`ifdef READBUFFER
assign FBReadComplete_int = badFuseDetectorEnable | selectBuffer_muxed | writeFB | LastFBReadAccess_int | FBReadComplete;
`endif
//
// MMOD4 Delay first trigger to guarantee setup time on CSB wrt STROBE in autonomous mode (Tsur_cs and Tsup_cs)
// assign trigger = ((CSBPipe & ~selectBuffer_muxed) ? CSBPipe & ~csb_to_fuse &  FBAccessDetect : FBAccess_pipe) 
assign trigger = (CSBPipe[3] & ~selectBuffer_muxed & ~badFuseDetectorEnable) ? (CSBPipe[3] & ~CSBPipe[2] &  FBAccessDetect) : (FBAccess_pipe     // MMOD4
`ifdef DOUBLEBIT
                 | doneFB_wr0_pulse
`endif
`ifdef READBUFFER
                 | doneFB_read_pulse
`endif
                                  )  ;
assign doneFB = doneFB_pre 
`ifdef DOUBLEBIT
                 & (~doneFB_wr0 | ~writeFB)
`endif
`ifdef READBUFFER
                 & FBReadComplete_int
`endif
                                   ;

// [start] : ReadBuffer {{{
`ifdef READBUFFER
reg strobeEnable_pipe;
`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
  if (FBreset) begin
    strobeEnable_pipe <= 1'b0;
  end else begin
    strobeEnable_pipe <= strobeEnable;
  end
end
`endif
// [end]   : ReadBuffer }}}
`ALWAYS_FF_KEYWORD @ (negedge clock or posedge FBreset) begin
  if (FBreset) begin
    strobeEnableR <= 1'b0;
  end else begin
`ifdef READBUFFER
	strobeEnableR <= ( FBReadComplete_int ? strobeEnable : strobeEnable_pipe) & newreadword;
`else
    strobeEnableR <= strobeEnable & newreadword;
`endif
  end
end

// [start] : Bad Fuse Mask {{{
`ifdef BADFUSEMASK
// Fault injection mechanism at the output of fuse box
// Only used for verification purposes
wire [31:0] fuseQmask;
assign fuseQmask = 32'b10101010101010101010101010101010;
assign fuseQ_IC = (TM) ? CtlObsFB : fuseQ & fuseQmask;
//
`else
assign fuseQ_IC = (TM) ? CtlObsFB : fuseQ ;
`endif
// [end]   : Bad Fuse Mask }}}

`ALWAYS_FF_KEYWORD @ (posedge clock ) begin
   if (TM) begin
        CtlObsFB <= { {(26-FUSEBOXADDRESSBITS){1'b0}} , fuseAdd, pd_to_fuse, ps_to_fuse, csb_to_fuse, STROBE, LOAD, PGENB};
   end else begin
        CtlObsFB <= 0;
   end
end

`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
   if (FBreset) begin
       fuse_dly_cnt <= DLY_CNT_LOAD;
   end else begin
        if ((selectFB & fuse_dly_cnt != 0) & ~selectBuffer_muxed ) begin
           fuse_dly_cnt <= fuse_dly_cnt - 1'b1;
       end else begin
           fuse_dly_cnt <= fuse_dly_cnt;
       end
   end
end

assign start_fuse_acc = (fuse_dly_cnt==0) & selectFB_dly[3];

`ALWAYS_FF_KEYWORD @ (posedge clock  or posedge FBreset) begin
   if (FBreset) begin
        fuse_acc_dly <= 0;
   end else begin
           fuse_acc_dly <=  {fuse_acc_dly[12:0], start_fuse_acc};
   end
end

`ALWAYS_FF_KEYWORD @ (posedge clock  or posedge FBreset) begin
   if (FBreset) begin
        fuse_csb_cnt <= 0;
   end else begin
        fuse_csb_cnt <=  {fuse_csb_cnt[fuse_csb_cnt_bits-2:0], (writeFB & selectFB)};
   end
end

`ALWAYS_FF_KEYWORD @ (posedge clock  or posedge FBreset) begin
   if (FBreset) begin
        selectFB_dly <= 0;
   end else begin
        selectFB_dly <=  {selectFB_dly[2:0], selectFB};
   end
end

`ALWAYS_FF_KEYWORD @ (posedge clock  or posedge FBreset) begin
   if (FBreset) begin
        FBAccess_pipe_reg <= 3'd0;
   end else begin
        FBAccess_pipe_reg <=  {FBAccess_pipe_reg[1:0], FBAccess & (rowAddressCountFirst | writeFB)};   // Mask contribution to trigger when performing initial eFuse read
   end
end
assign FBAccess_pipe = newreadword ? FBAccess_pipe_reg[1] : FBAccess_pipe_reg[0];

// ==
// ================ Fuse Box Instanciation =======================
// ==
`ifdef FUSEBOX_MODULE
`else
    `define FUSEBOX_MODULE TEF28HPM16X32HD18_PHRM
`endif
//
// MMOD1: 3 new parameters defining options that are present. Optional ports are tied off.           
//   Possible values are REDUNDANCYBITS, TESTROWSCOLUMNS, MARGINREAD2
//
// User must specify only one parameter defining the number of 32-bit words if more than 8.
//   Possible values are WORDS16, WORDS32, WORDS64, WORDS128, WORDS256
//
// [start] : FuseBox instance {{{
`FUSEBOX_MODULE fuse_box_instance (
                        .CSB(csb_to_fuse | TM), .STROBE(STROBE), .LOAD(LOAD), .PGENB(PGENB), .PS(ps_to_fuse & ~TM), .PD(pd_to_fuse | TM), 
`ifdef REDUNDANCYBITS
                        .RSB(1'b1), .RWL(1'b0),
`endif
`ifdef TESTROWSCOLUMNS
                        .TRCS(1'b0), .AT1(1'b0), .AT0(1'b0),
`endif
`ifdef MARGINREAD2
                        .TS1(1'b0), .TS0(1'b0),
`else
                        .MR(1'b0),
`endif
                        `ifdef WORDS256
                        .A12(fuseAdd[12]),          // Only if number of words is 256 
                        .A11(fuseAdd[11]),          // Only if number of words is >= 128
                        .A10(fuseAdd[10]),          // Only if number of words is >= 64
                        .A9(fuseAdd[9]),            // Only if number of words is >= 32
                        .A8(fuseAdd[8]),            // Only if number of words is >= 16
                        `endif
                        `ifdef WORDS128
                        .A11(fuseAdd[11]),          // Only if number of words is >= 128
                        .A10(fuseAdd[10]),          // Only if number of words is >= 64
                        .A9(fuseAdd[9]),            // Only if number of words is >= 32
                        .A8(fuseAdd[8]),            // Only if number of words is >= 16
                        `endif
                        `ifdef WORDS64
                        .A10(fuseAdd[10]),          // Only if number of words is >= 64
                        .A9(fuseAdd[9]),            // Only if number of words is >= 32
                        .A8(fuseAdd[8]),            // Only if number of words is >= 16
                        `endif
                        `ifdef WORDS32
                        .A9(fuseAdd[9]),            // Only if number of words is >= 32
                        .A8(fuseAdd[8]),            // Only if number of words is >= 16
                        `endif
                        `ifdef WORDS16 
                        .A8(fuseAdd[8]),            // Only if number of words is >= 16
                        `endif
                        .A7(fuseAdd[7]), .A6(fuseAdd[6]), .A5(fuseAdd[5]),
                        .A4(fuseAdd[4]), .A3(fuseAdd[3]), .A2(fuseAdd[2]), .A1(fuseAdd[1]), .A0(fuseAdd[0]),
                        .Q31(fuseQ[31]), .Q30(fuseQ[30]),
                        .Q29(fuseQ[29]), .Q28(fuseQ[28]), .Q27(fuseQ[27]), .Q26(fuseQ[26]), .Q25(fuseQ[25]),
                        .Q24(fuseQ[24]), .Q23(fuseQ[23]), .Q22(fuseQ[22]), .Q21(fuseQ[21]), .Q20(fuseQ[20]),
                        .Q19(fuseQ[19]), .Q18(fuseQ[18]), .Q17(fuseQ[17]), .Q16(fuseQ[16]), .Q15(fuseQ[15]),
                        .Q14(fuseQ[14]), .Q13(fuseQ[13]), .Q12(fuseQ[12]), .Q11(fuseQ[11]), .Q10(fuseQ[10]),
                        .Q9(fuseQ[9]), .Q8(fuseQ[8]), .Q7(fuseQ[7]), .Q6(fuseQ[6]), .Q5(fuseQ[5]), 
                        .Q4(fuseQ[4]), .Q3(fuseQ[3]), .Q2(fuseQ[2]), .Q1(fuseQ[1]), .Q0(fuseQ[0]));
// [end]   : FuseBox instance }}}

`ifdef READBUFFER
// [start] : ReadBuffer enabled {{{
//
// Optional code for read buffer
//
    `ifdef DOUBLEBIT
    // [start] : Assign fuseValue {{{
reg [15:0] readBuffer [NWORDS-1:0] ;  // Words are only 16 bit wide if DOUBLEBIT is defined
                                // Number of words need to be parameterized based on WORDSxx
wire [15:0] readBufferOut; 

    assign fuseValue = ((Address[3:0]==4'h0) & readBufferOut[0] |
                      (Address[3:0]==4'h1) &  readBufferOut[1] |
                      (Address[3:0]==4'h2) &  readBufferOut[2] |
                      (Address[3:0]==4'h3) &  readBufferOut[3] |
                      (Address[3:0]==4'h4) &  readBufferOut[4] |
                      (Address[3:0]==4'h5) &  readBufferOut[5] |
                      (Address[3:0]==4'h6) &  readBufferOut[6] |
                      (Address[3:0]==4'h7) &  readBufferOut[7] |
                      (Address[3:0]==4'h8) &  readBufferOut[8] |
                      (Address[3:0]==4'h9) &  readBufferOut[9] |
                      (Address[3:0]==4'ha) &  readBufferOut[10] |
                      (Address[3:0]==4'hb) &  readBufferOut[11] |
                      (Address[3:0]==4'hc) &  readBufferOut[12] |
                      (Address[3:0]==4'hd) &  readBufferOut[13] |
                      (Address[3:0]==4'he) &  readBufferOut[14] |
                      (Address[3:0]==4'hf) &  readBufferOut[15]) ;


    // [end]   : Assign fuseValue }}}
     `else
     // [start] : Assign fuseValue {{{
reg [31:0] readBuffer [NWORDS-1:0] ;  // Words are 32 bit wide if DOUBLEBIT is NOT defined
                                // Number of words need to be parameterized based on WORDSxx
wire [31:0] readBufferOut; 

        assign fuseValue = ((Address[4:0]==5'h00) & readBufferOut[0] | 
                      (Address[4:0]==5'h01) & readBufferOut[1] |
                      (Address[4:0]==5'h02) & readBufferOut[2] |
                      (Address[4:0]==5'h03) & readBufferOut[3] |
                      (Address[4:0]==5'h04) & readBufferOut[4] |
                      (Address[4:0]==5'h05) & readBufferOut[5] |
                      (Address[4:0]==5'h06) & readBufferOut[6] |
                      (Address[4:0]==5'h07) & readBufferOut[7] |
                      (Address[4:0]==5'h08) & readBufferOut[8] |
                      (Address[4:0]==5'h09) & readBufferOut[9] |
                      (Address[4:0]==5'h0a) & readBufferOut[10] |
                      (Address[4:0]==5'h0b) & readBufferOut[11] |
                      (Address[4:0]==5'h0c) & readBufferOut[12] |
                      (Address[4:0]==5'h0d) & readBufferOut[13] |
                      (Address[4:0]==5'h0e) & readBufferOut[14] |
                      (Address[4:0]==5'h0f) & readBufferOut[15] | 
                      (Address[4:0]==5'h10) & readBufferOut[16] | 
                      (Address[4:0]==5'h11) & readBufferOut[17] |
                      (Address[4:0]==5'h12) & readBufferOut[18] |
                      (Address[4:0]==5'h13) & readBufferOut[19] |
                      (Address[4:0]==5'h14) & readBufferOut[20] |
                      (Address[4:0]==5'h15) & readBufferOut[21] |
                      (Address[4:0]==5'h16) & readBufferOut[22] |
                      (Address[4:0]==5'h17) & readBufferOut[23] |
                      (Address[4:0]==5'h18) & readBufferOut[24] |
                      (Address[4:0]==5'h19) & readBufferOut[25] |
                      (Address[4:0]==5'h1a) & readBufferOut[26] |
                      (Address[4:0]==5'h1b) & readBufferOut[27] |
                      (Address[4:0]==5'h1c) & readBufferOut[28] |
                      (Address[4:0]==5'h1d) & readBufferOut[29] |
                      (Address[4:0]==5'h1e) & readBufferOut[30] |
                      (Address[4:0]==5'h1f) & readBufferOut[31]) ;
     // [end]   : Assign fuseValue }}}
    `endif

`ALWAYS_FF_KEYWORD @ (posedge clock) begin
   if (doneFB_pre & ~rowAddressSelect) begin
       readBuffer[currentwordadd] <= readBufferIn;
   end
end

assign readBufferOut = readBuffer[rowAddressFBCtrl];
//
// fuseVector to be parameterized as a function of WORDSxx  8, 16, 32, 64, 128, 256
//   Only 8,16,32 and 64 words implemented so far
// [start] : assign fuseVector {{{
assign fuseVector = {
`ifdef WORDS256
                     readBuffer[255],readBuffer[254],readBuffer[253],readBuffer[252],readBuffer[251],readBuffer[250],readBuffer[249],readBuffer[248],
                     readBuffer[247],readBuffer[246],readBuffer[245],readBuffer[244],readBuffer[243],readBuffer[242],readBuffer[241],readBuffer[240],
                     readBuffer[239],readBuffer[238],readBuffer[237],readBuffer[236],readBuffer[235],readBuffer[234],readBuffer[233],readBuffer[232],
                     readBuffer[231],readBuffer[230],readBuffer[229],readBuffer[228],readBuffer[227],readBuffer[226],readBuffer[225],readBuffer[224],
                     readBuffer[223],readBuffer[222],readBuffer[221],readBuffer[220],readBuffer[219],readBuffer[218],readBuffer[217],readBuffer[216],
                     readBuffer[215],readBuffer[214],readBuffer[213],readBuffer[212],readBuffer[211],readBuffer[210],readBuffer[209],readBuffer[208],
                     readBuffer[207],readBuffer[206],readBuffer[205],readBuffer[204],readBuffer[203],readBuffer[202],readBuffer[201],readBuffer[200],
                     readBuffer[199],readBuffer[198],readBuffer[197],readBuffer[196],readBuffer[195],readBuffer[194],readBuffer[193],readBuffer[192],
                     readBuffer[191],readBuffer[190],readBuffer[189],readBuffer[188],readBuffer[187],readBuffer[186],readBuffer[185],readBuffer[184],
                     readBuffer[183],readBuffer[182],readBuffer[181],readBuffer[180],readBuffer[179],readBuffer[178],readBuffer[177],readBuffer[176],
                     readBuffer[175],readBuffer[174],readBuffer[173],readBuffer[172],readBuffer[171],readBuffer[170],readBuffer[169],readBuffer[168],
                     readBuffer[167],readBuffer[166],readBuffer[165],readBuffer[164],readBuffer[163],readBuffer[162],readBuffer[161],readBuffer[160],
                     readBuffer[159],readBuffer[158],readBuffer[157],readBuffer[156],readBuffer[155],readBuffer[154],readBuffer[153],readBuffer[152],
                     readBuffer[151],readBuffer[150],readBuffer[149],readBuffer[148],readBuffer[147],readBuffer[146],readBuffer[145],readBuffer[144],
                     readBuffer[143],readBuffer[142],readBuffer[141],readBuffer[140],readBuffer[139],readBuffer[138],readBuffer[137],readBuffer[136],
                     readBuffer[135],readBuffer[134],readBuffer[133],readBuffer[132],readBuffer[131],readBuffer[130],readBuffer[129],readBuffer[128],
                     readBuffer[127],readBuffer[126],readBuffer[125],readBuffer[124],readBuffer[123],readBuffer[122],readBuffer[121],readBuffer[120],
                     readBuffer[119],readBuffer[118],readBuffer[117],readBuffer[116],readBuffer[115],readBuffer[114],readBuffer[113],readBuffer[112],
                     readBuffer[111],readBuffer[110],readBuffer[109],readBuffer[108],readBuffer[107],readBuffer[106],readBuffer[105],readBuffer[104],
                     readBuffer[103],readBuffer[102],readBuffer[101],readBuffer[100],readBuffer[99],readBuffer[98],readBuffer[97],readBuffer[96],
                     readBuffer[95],readBuffer[94],readBuffer[93],readBuffer[92],readBuffer[91],readBuffer[90],readBuffer[89],readBuffer[88],
                     readBuffer[87],readBuffer[86],readBuffer[85],readBuffer[84],readBuffer[83],readBuffer[82],readBuffer[81],readBuffer[80],
                     readBuffer[79],readBuffer[78],readBuffer[77],readBuffer[76],readBuffer[75],readBuffer[74],readBuffer[73],readBuffer[72],
                     readBuffer[71],readBuffer[70],readBuffer[69],readBuffer[68],readBuffer[67],readBuffer[66],readBuffer[65],readBuffer[64],
                     readBuffer[63],readBuffer[62],readBuffer[61],readBuffer[60],readBuffer[59],readBuffer[58],readBuffer[57],readBuffer[56],
                     readBuffer[55],readBuffer[54],readBuffer[53],readBuffer[52],readBuffer[51],readBuffer[50],readBuffer[49],readBuffer[48],
                     readBuffer[47],readBuffer[46],readBuffer[45],readBuffer[44],readBuffer[43],readBuffer[42],readBuffer[41],readBuffer[40],
                     readBuffer[39],readBuffer[38],readBuffer[37],readBuffer[36],readBuffer[35],readBuffer[34],readBuffer[33],readBuffer[32],
                     readBuffer[31],readBuffer[30],readBuffer[29],readBuffer[28],readBuffer[27],readBuffer[26],readBuffer[25],readBuffer[24],
                     readBuffer[23],readBuffer[22],readBuffer[21],readBuffer[20],readBuffer[19],readBuffer[18],readBuffer[17],readBuffer[16],
                     readBuffer[15],readBuffer[14],readBuffer[13],readBuffer[12],readBuffer[11],readBuffer[10],readBuffer[9],readBuffer[8],
`endif
`ifdef WORDS128
                     readBuffer[127], readBuffer[126], readBuffer[125], readBuffer[124], readBuffer[123], readBuffer[122], readBuffer[121], readBuffer[120], 
                     readBuffer[119], readBuffer[118], readBuffer[117], readBuffer[116], readBuffer[115], readBuffer[114], readBuffer[113], readBuffer[112], 
                     readBuffer[111], readBuffer[110], readBuffer[109], readBuffer[108], readBuffer[107], readBuffer[106], readBuffer[105], readBuffer[104], 
                     readBuffer[103], readBuffer[102], readBuffer[101], readBuffer[100], readBuffer[99], readBuffer[98], readBuffer[97], readBuffer[96], 
                     readBuffer[95], readBuffer[94], readBuffer[93], readBuffer[92], readBuffer[91], readBuffer[90], readBuffer[89], readBuffer[88], 
                     readBuffer[87], readBuffer[86], readBuffer[85], readBuffer[84], readBuffer[83], readBuffer[82], readBuffer[81], readBuffer[80], 
                     readBuffer[79], readBuffer[78], readBuffer[77], readBuffer[76], readBuffer[75], readBuffer[74], readBuffer[73], readBuffer[72], 
                     readBuffer[71], readBuffer[70], readBuffer[69], readBuffer[68], readBuffer[67], readBuffer[66], readBuffer[65], readBuffer[64], 
                     readBuffer[63], readBuffer[62], readBuffer[61], readBuffer[60], readBuffer[59], readBuffer[58], readBuffer[57], readBuffer[56], 
                     readBuffer[55], readBuffer[54], readBuffer[53], readBuffer[52], readBuffer[51], readBuffer[50], readBuffer[49], readBuffer[48], 
                     readBuffer[47], readBuffer[46], readBuffer[45], readBuffer[44], readBuffer[43], readBuffer[42], readBuffer[41], readBuffer[40], 
                     readBuffer[39], readBuffer[38], readBuffer[37], readBuffer[36], readBuffer[35], readBuffer[34], readBuffer[33], readBuffer[32], 
                     readBuffer[31], readBuffer[30], readBuffer[29], readBuffer[28], readBuffer[27], readBuffer[26], readBuffer[25], readBuffer[24], 
                     readBuffer[23], readBuffer[22], readBuffer[21], readBuffer[20], readBuffer[19], readBuffer[18], readBuffer[17], readBuffer[16], 
                     readBuffer[15], readBuffer[14], readBuffer[13], readBuffer[12], readBuffer[11], readBuffer[10], readBuffer[9], readBuffer[8], 
`endif
`ifdef WORDS64
                     readBuffer[63], readBuffer[62], readBuffer[61], readBuffer[60], readBuffer[59], readBuffer[58], readBuffer[57], readBuffer[56], 
                     readBuffer[55], readBuffer[54], readBuffer[53], readBuffer[52], readBuffer[51], readBuffer[50], readBuffer[49], readBuffer[48], 
                     readBuffer[47], readBuffer[46], readBuffer[45], readBuffer[44], readBuffer[43], readBuffer[42], readBuffer[41], readBuffer[40], 
                     readBuffer[39], readBuffer[38], readBuffer[37], readBuffer[36], readBuffer[35], readBuffer[34], readBuffer[33], readBuffer[32], 
                     readBuffer[31], readBuffer[30], readBuffer[29], readBuffer[28], readBuffer[27], readBuffer[26], readBuffer[25], readBuffer[24], 
                     readBuffer[23], readBuffer[22], readBuffer[21], readBuffer[20], readBuffer[19], readBuffer[18], readBuffer[17], readBuffer[16], 
                     readBuffer[15], readBuffer[14], readBuffer[13], readBuffer[12], readBuffer[11], readBuffer[10], readBuffer[9], readBuffer[8], 
`endif
`ifdef WORDS32
                     readBuffer[31], readBuffer[30], readBuffer[29], readBuffer[28], readBuffer[27], readBuffer[26], readBuffer[25], readBuffer[24], 
                     readBuffer[23], readBuffer[22], readBuffer[21], readBuffer[20], readBuffer[19], readBuffer[18], readBuffer[17], readBuffer[16], 
                     readBuffer[15], readBuffer[14], readBuffer[13], readBuffer[12], readBuffer[11], readBuffer[10], readBuffer[9], readBuffer[8], 
`endif
`ifdef WORDS16
                     readBuffer[15], readBuffer[14], readBuffer[13], readBuffer[12], readBuffer[11], readBuffer[10], readBuffer[9], readBuffer[8], 
`endif
                     readBuffer[7], readBuffer[6], readBuffer[5], readBuffer[4], readBuffer[3], readBuffer[2], readBuffer[1], readBuffer[0]};
// [end]   : assign fuseVector }}}
// end assignment of fuseVector

// Registers and signals used for read buffer function
wire rowAddressCountLast, rowAddressCountReset, rowAddressCountEnable ;

assign LastFBReadAccess_int = doneFB_pre & ~writeFB & ~selectBuffer_muxed & rowAddressCountLast;

`ALWAYS_FF_KEYWORD @ (posedge clock  or posedge FBreset) begin
   if (FBreset) begin
        FBReadComplete <= 0;
        doneFB_read_pulse <= 0;
   end else begin
        FBReadComplete <=  FBReadComplete | LastFBReadAccess_int;
        doneFB_read_pulse <=  doneFB_pre & ~writeFB & ~selectBuffer_muxed & ~rowAddressCountLast & ~FBReadComplete & ~badFuseDetectorEnable;
   end
end

// Row address counter 

`ALWAYS_FF_KEYWORD @ (posedge clock or posedge FBreset) begin
   if (FBreset) begin
      `ifdef DOUBLEBIT
        rowAddressCount <= {(FUSEBOXADDRESSBITS-4){1'b0}};
      `else
        rowAddressCount <= {(FUSEBOXADDRESSBITS-5){1'b0}};
      `endif
   end else begin
     if (rowAddressCountReset) begin
      `ifdef DOUBLEBIT
        rowAddressCount <= {(FUSEBOXADDRESSBITS-4){1'b0}};
      `else
        rowAddressCount <= {(FUSEBOXADDRESSBITS-5){1'b0}};
      `endif
     end else begin
       if (rowAddressCountEnable) begin
         rowAddressCount <= rowAddressCount + 1;
       end else begin
         rowAddressCount <= rowAddressCount ;
       end
     end
   end
end

assign rowAddressSelect = FBReadComplete | selectBuffer_muxed | writeFB | badFuseDetectorEnable;
wire newReadWord_read;
assign newReadWord_read = badFuseDetectorEnable ? (lastwordadd != {1'b0,currentwordadd}) & ~selectBuffer_muxed : ~rowAddressSelect;
assign newreadword = writeFB | newReadWord_read;
  `ifdef DOUBLEBIT
  // DOUBLEBIT & READBUFFER
  assign rowAddressCountLast = rowAddressCount == {(FUSEBOXADDRESSBITS-4){1'b1}};
  assign rowAddressCountFirst = rowAddressCount == {(FUSEBOXADDRESSBITS-4){1'b0}};
  `else
  // ~DOUBLEBIT & READBUFFER
  assign rowAddressCountLast = rowAddressCount == {(FUSEBOXADDRESSBITS-5){1'b1}};
  assign rowAddressCountFirst = rowAddressCount == {(FUSEBOXADDRESSBITS-5){1'b0}};
  `endif
assign rowAddressCountEnable = doneFB_pre & ~writeFB;
assign rowAddressCountReset = rowAddressSelect;
// [end]   : ReadBuffer enabled }}}
`else
// [start] : ReadBuffer disabled {{{
// There is no read buffer
  `ifdef DOUBLEBIT
  // [start] : Assign FuseValue when DoubleBit is enabled {{{
    assign fuseValue = ((Address[3:0]==4'h0) & readBufferIn[0] |
                       (Address[3:0]==4'h1) &  readBufferIn[1] |
                       (Address[3:0]==4'h2) &  readBufferIn[2] |
                       (Address[3:0]==4'h3) &  readBufferIn[3] |
                       (Address[3:0]==4'h4) &  readBufferIn[4] |
                       (Address[3:0]==4'h5) &  readBufferIn[5] |
                       (Address[3:0]==4'h6) &  readBufferIn[6] |
                       (Address[3:0]==4'h7) &  readBufferIn[7] |
                       (Address[3:0]==4'h8) &  readBufferIn[8] |
                       (Address[3:0]==4'h9) &  readBufferIn[9] |
                       (Address[3:0]==4'ha) &  readBufferIn[10] |
                       (Address[3:0]==4'hb) &  readBufferIn[11] |
                       (Address[3:0]==4'hc) &  readBufferIn[12] |
                       (Address[3:0]==4'hd) &  readBufferIn[13] |
                       (Address[3:0]==4'he) &  readBufferIn[14] |
                       (Address[3:0]==4'hf) &  readBufferIn[15]) ;
  // [end]   : Assign FuseValue when DoubleBit is enabled }}}
  `else
     // [start] : Assign fuseValue {{{
        assign fuseValue = ((Address[4:0]==5'h00) & fuseQ_IC[0] | 
                            (Address[4:0]==5'h01) & fuseQ_IC[1] |
                            (Address[4:0]==5'h02) & fuseQ_IC[2] |
                            (Address[4:0]==5'h03) & fuseQ_IC[3] |
                            (Address[4:0]==5'h04) & fuseQ_IC[4] |
                            (Address[4:0]==5'h05) & fuseQ_IC[5] |
                            (Address[4:0]==5'h06) & fuseQ_IC[6] |
                            (Address[4:0]==5'h07) & fuseQ_IC[7] |
                            (Address[4:0]==5'h08) & fuseQ_IC[8] |
                            (Address[4:0]==5'h09) & fuseQ_IC[9] |
                            (Address[4:0]==5'h0a) & fuseQ_IC[10] |
                            (Address[4:0]==5'h0b) & fuseQ_IC[11] |
                            (Address[4:0]==5'h0c) & fuseQ_IC[12] |
                            (Address[4:0]==5'h0d) & fuseQ_IC[13] |
                            (Address[4:0]==5'h0e) & fuseQ_IC[14] |
                            (Address[4:0]==5'h0f) & fuseQ_IC[15] | 
                            (Address[4:0]==5'h10) & fuseQ_IC[16] | 
                            (Address[4:0]==5'h11) & fuseQ_IC[17] |
                            (Address[4:0]==5'h12) & fuseQ_IC[18] |
                            (Address[4:0]==5'h13) & fuseQ_IC[19] |
                            (Address[4:0]==5'h14) & fuseQ_IC[20] |
                            (Address[4:0]==5'h15) & fuseQ_IC[21] |
                            (Address[4:0]==5'h16) & fuseQ_IC[22] |
                            (Address[4:0]==5'h17) & fuseQ_IC[23] |
                            (Address[4:0]==5'h18) & fuseQ_IC[24] |
                            (Address[4:0]==5'h19) & fuseQ_IC[25] |
                            (Address[4:0]==5'h1a) & fuseQ_IC[26] |
                            (Address[4:0]==5'h1b) & fuseQ_IC[27] |
                            (Address[4:0]==5'h1c) & fuseQ_IC[28] |
                            (Address[4:0]==5'h1d) & fuseQ_IC[29] |
                            (Address[4:0]==5'h1e) & fuseQ_IC[30] |
                            (Address[4:0]==5'h1f) & fuseQ_IC[31]) ;
     // [end]   : Assign fuseValue }}}
  `endif
assign rowAddressCountFirst = 1'b1;
assign FBReadComplete = 1'b0;

assign newreadword = writeFB ? 1'b1 : ((lastwordadd != {1'b0,currentwordadd}) & ~selectBuffer_muxed);

// [end]   : ReadBuffer disabled }}}
`endif
`ALWAYS_FF_KEYWORD @ (posedge clock) begin
   if (~start_fuse_acc) begin
    `ifdef DOUBLEBIT
        lastwordadd <= {(FUSEBOXADDRESSBITS-3){1'b1}};
    `else
        lastwordadd <= {(FUSEBOXADDRESSBITS-4){1'b1}};
    `endif
   end else begin
        lastwordadd <= doneFB & ~writeFB ? {1'b0,currentwordadd} : lastwordadd;
   end
end

endmodule

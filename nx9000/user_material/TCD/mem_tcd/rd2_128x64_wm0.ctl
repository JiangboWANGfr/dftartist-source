/* ctl_memcomp Version: c0.2.15-EAC */
/* common_memcomp Version: c0.2.12-beta */
/* lang compiler Version: 4.9.4-EAC Jul 12 2017 12:42:23 */
//
//       CONFIDENTIAL AND PROPRIETARY SOFTWARE OF ARM PHYSICAL IP, INC.
//      
//       Copyright (c) 1993 - 2025 ARM Physical IP, Inc.  All Rights Reserved.
//      
//       Use of this Software is subject to the terms and conditions of the
//       applicable license agreement with ARM Physical IP, Inc.
//       In addition, this Software is protected by patents, copyright law 
//       and international treaties.
//      
//       The copyright notice(s) in this Software does not indicate actual or
//       intended publication of this Software.
//
//      CTL model for High Density Two Port Register File SVT MVT Compiler
//
//       Instance Name:              rd2_128x64_wm0
//       Words:                      128
//       Bits:                       64
//       Mux:                        2
//       Drive:                      6
//       Write Mask:                 Off
//       Write Thru:                 Off
//       Extra Margin Adjustment:    On
//       Redundant Columns:          2
//       Test Muxes                  On
//       Power Gating:               Off
//       Retention:                  On
//       Pipeline:                   Off
//       Read Disturb Test:	        Off
//       
//       Creation Date:  Mon Dec 15 22:09:40 2025
//       Version: 	r0p1
STIL 1.0 {
   CTL P2001.10;
   Design P2001.01;
}
Header {
   Title "CTL model for `rd2_128x64_wm0";
}
Signals {
   "CENYA" Out;
   "AYA[6]" Out;
   "AYA[5]" Out;
   "AYA[4]" Out;
   "AYA[3]" Out;
   "AYA[2]" Out;
   "AYA[1]" Out;
   "AYA[0]" Out;
   "CENYB" Out;
   "AYB[6]" Out;
   "AYB[5]" Out;
   "AYB[4]" Out;
   "AYB[3]" Out;
   "AYB[2]" Out;
   "AYB[1]" Out;
   "AYB[0]" Out;
   "QA[63]" Out;
   "QA[62]" Out;
   "QA[61]" Out;
   "QA[60]" Out;
   "QA[59]" Out;
   "QA[58]" Out;
   "QA[57]" Out;
   "QA[56]" Out;
   "QA[55]" Out;
   "QA[54]" Out;
   "QA[53]" Out;
   "QA[52]" Out;
   "QA[51]" Out;
   "QA[50]" Out;
   "QA[49]" Out;
   "QA[48]" Out;
   "QA[47]" Out;
   "QA[46]" Out;
   "QA[45]" Out;
   "QA[44]" Out;
   "QA[43]" Out;
   "QA[42]" Out;
   "QA[41]" Out;
   "QA[40]" Out;
   "QA[39]" Out;
   "QA[38]" Out;
   "QA[37]" Out;
   "QA[36]" Out;
   "QA[35]" Out;
   "QA[34]" Out;
   "QA[33]" Out;
   "QA[32]" Out;
   "QA[31]" Out;
   "QA[30]" Out;
   "QA[29]" Out;
   "QA[28]" Out;
   "QA[27]" Out;
   "QA[26]" Out;
   "QA[25]" Out;
   "QA[24]" Out;
   "QA[23]" Out;
   "QA[22]" Out;
   "QA[21]" Out;
   "QA[20]" Out;
   "QA[19]" Out;
   "QA[18]" Out;
   "QA[17]" Out;
   "QA[16]" Out;
   "QA[15]" Out;
   "QA[14]" Out;
   "QA[13]" Out;
   "QA[12]" Out;
   "QA[11]" Out;
   "QA[10]" Out;
   "QA[9]" Out;
   "QA[8]" Out;
   "QA[7]" Out;
   "QA[6]" Out;
   "QA[5]" Out;
   "QA[4]" Out;
   "QA[3]" Out;
   "QA[2]" Out;
   "QA[1]" Out;
   "QA[0]" Out;
   "SOA[1]" Out;
   "SOA[0]" Out;
   "SOB[1]" Out;
   "SOB[0]" Out;
   "CLKA" In;
   "CENA" In;
   "AA[6]" In;
   "AA[5]" In;
   "AA[4]" In;
   "AA[3]" In;
   "AA[2]" In;
   "AA[1]" In;
   "AA[0]" In;
   "CLKB" In;
   "CENB" In;
   "AB[6]" In;
   "AB[5]" In;
   "AB[4]" In;
   "AB[3]" In;
   "AB[2]" In;
   "AB[1]" In;
   "AB[0]" In;
   "DB[63]" In;
   "DB[62]" In;
   "DB[61]" In;
   "DB[60]" In;
   "DB[59]" In;
   "DB[58]" In;
   "DB[57]" In;
   "DB[56]" In;
   "DB[55]" In;
   "DB[54]" In;
   "DB[53]" In;
   "DB[52]" In;
   "DB[51]" In;
   "DB[50]" In;
   "DB[49]" In;
   "DB[48]" In;
   "DB[47]" In;
   "DB[46]" In;
   "DB[45]" In;
   "DB[44]" In;
   "DB[43]" In;
   "DB[42]" In;
   "DB[41]" In;
   "DB[40]" In;
   "DB[39]" In;
   "DB[38]" In;
   "DB[37]" In;
   "DB[36]" In;
   "DB[35]" In;
   "DB[34]" In;
   "DB[33]" In;
   "DB[32]" In;
   "DB[31]" In;
   "DB[30]" In;
   "DB[29]" In;
   "DB[28]" In;
   "DB[27]" In;
   "DB[26]" In;
   "DB[25]" In;
   "DB[24]" In;
   "DB[23]" In;
   "DB[22]" In;
   "DB[21]" In;
   "DB[20]" In;
   "DB[19]" In;
   "DB[18]" In;
   "DB[17]" In;
   "DB[16]" In;
   "DB[15]" In;
   "DB[14]" In;
   "DB[13]" In;
   "DB[12]" In;
   "DB[11]" In;
   "DB[10]" In;
   "DB[9]" In;
   "DB[8]" In;
   "DB[7]" In;
   "DB[6]" In;
   "DB[5]" In;
   "DB[4]" In;
   "DB[3]" In;
   "DB[2]" In;
   "DB[1]" In;
   "DB[0]" In;
   "EMAA[2]" In;
   "EMAA[1]" In;
   "EMAA[0]" In;
   "EMASA" In;
   "EMAB[2]" In;
   "EMAB[1]" In;
   "EMAB[0]" In;
   "TENA" In;
   "TCENA" In;
   "TAA[6]" In;
   "TAA[5]" In;
   "TAA[4]" In;
   "TAA[3]" In;
   "TAA[2]" In;
   "TAA[1]" In;
   "TAA[0]" In;
   "TENB" In;
   "TCENB" In;
   "TAB[6]" In;
   "TAB[5]" In;
   "TAB[4]" In;
   "TAB[3]" In;
   "TAB[2]" In;
   "TAB[1]" In;
   "TAB[0]" In;
   "TDB[63]" In;
   "TDB[62]" In;
   "TDB[61]" In;
   "TDB[60]" In;
   "TDB[59]" In;
   "TDB[58]" In;
   "TDB[57]" In;
   "TDB[56]" In;
   "TDB[55]" In;
   "TDB[54]" In;
   "TDB[53]" In;
   "TDB[52]" In;
   "TDB[51]" In;
   "TDB[50]" In;
   "TDB[49]" In;
   "TDB[48]" In;
   "TDB[47]" In;
   "TDB[46]" In;
   "TDB[45]" In;
   "TDB[44]" In;
   "TDB[43]" In;
   "TDB[42]" In;
   "TDB[41]" In;
   "TDB[40]" In;
   "TDB[39]" In;
   "TDB[38]" In;
   "TDB[37]" In;
   "TDB[36]" In;
   "TDB[35]" In;
   "TDB[34]" In;
   "TDB[33]" In;
   "TDB[32]" In;
   "TDB[31]" In;
   "TDB[30]" In;
   "TDB[29]" In;
   "TDB[28]" In;
   "TDB[27]" In;
   "TDB[26]" In;
   "TDB[25]" In;
   "TDB[24]" In;
   "TDB[23]" In;
   "TDB[22]" In;
   "TDB[21]" In;
   "TDB[20]" In;
   "TDB[19]" In;
   "TDB[18]" In;
   "TDB[17]" In;
   "TDB[16]" In;
   "TDB[15]" In;
   "TDB[14]" In;
   "TDB[13]" In;
   "TDB[12]" In;
   "TDB[11]" In;
   "TDB[10]" In;
   "TDB[9]" In;
   "TDB[8]" In;
   "TDB[7]" In;
   "TDB[6]" In;
   "TDB[5]" In;
   "TDB[4]" In;
   "TDB[3]" In;
   "TDB[2]" In;
   "TDB[1]" In;
   "TDB[0]" In;
   "RET1N" In;
   "SIA[1]" In;
   "SIA[0]" In;
   "SEA" In;
   "DFTRAMBYP" In;
   "SIB[1]" In;
   "SIB[0]" In;
   "SEB" In;
   "CRE1" In;
   "CRE2" In;
   "FCA1[4]" In;
   "FCA1[3]" In;
   "FCA1[2]" In;
   "FCA1[1]" In;
   "FCA1[0]" In;
   "FCA2[4]" In;
   "FCA2[3]" In;
   "FCA2[2]" In;
   "FCA2[1]" In;
   "FCA2[0]" In;
   "COLLDISN" In;
}
SignalGroups {
   "all_inputs" = '"CLKA" + "CENA" + "AA[6]" + "AA[5]" + "AA[4]" + "AA[3]" + "AA[2]" + 
   "AA[1]" + "AA[0]" + "CLKB" + "CENB" + "AB[6]" + "AB[5]" + "AB[4]" + "AB[3]" + 
   "AB[2]" + "AB[1]" + "AB[0]" + "DB[63]" + "DB[62]" + "DB[61]" + "DB[60]" + "DB[59]" + 
   "DB[58]" + "DB[57]" + "DB[56]" + "DB[55]" + "DB[54]" + "DB[53]" + "DB[52]" + "DB[51]" + 
   "DB[50]" + "DB[49]" + "DB[48]" + "DB[47]" + "DB[46]" + "DB[45]" + "DB[44]" + "DB[43]" + 
   "DB[42]" + "DB[41]" + "DB[40]" + "DB[39]" + "DB[38]" + "DB[37]" + "DB[36]" + "DB[35]" + 
   "DB[34]" + "DB[33]" + "DB[32]" + "DB[31]" + "DB[30]" + "DB[29]" + "DB[28]" + "DB[27]" + 
   "DB[26]" + "DB[25]" + "DB[24]" + "DB[23]" + "DB[22]" + "DB[21]" + "DB[20]" + "DB[19]" + 
   "DB[18]" + "DB[17]" + "DB[16]" + "DB[15]" + "DB[14]" + "DB[13]" + "DB[12]" + "DB[11]" + 
   "DB[10]" + "DB[9]" + "DB[8]" + "DB[7]" + "DB[6]" + "DB[5]" + "DB[4]" + "DB[3]" + 
   "DB[2]" + "DB[1]" + "DB[0]" + "EMAA[2]" + "EMAA[1]" + "EMAA[0]" + "EMASA" + "EMAB[2]" + 
   "EMAB[1]" + "EMAB[0]" + "TENA" + "TCENA" + "TAA[6]" + "TAA[5]" + "TAA[4]" + "TAA[3]" + 
   "TAA[2]" + "TAA[1]" + "TAA[0]" + "TENB" + "TCENB" + "TAB[6]" + "TAB[5]" + "TAB[4]" + 
   "TAB[3]" + "TAB[2]" + "TAB[1]" + "TAB[0]" + "TDB[63]" + "TDB[62]" + "TDB[61]" + 
   "TDB[60]" + "TDB[59]" + "TDB[58]" + "TDB[57]" + "TDB[56]" + "TDB[55]" + "TDB[54]" + 
   "TDB[53]" + "TDB[52]" + "TDB[51]" + "TDB[50]" + "TDB[49]" + "TDB[48]" + "TDB[47]" + 
   "TDB[46]" + "TDB[45]" + "TDB[44]" + "TDB[43]" + "TDB[42]" + "TDB[41]" + "TDB[40]" + 
   "TDB[39]" + "TDB[38]" + "TDB[37]" + "TDB[36]" + "TDB[35]" + "TDB[34]" + "TDB[33]" + 
   "TDB[32]" + "TDB[31]" + "TDB[30]" + "TDB[29]" + "TDB[28]" + "TDB[27]" + "TDB[26]" + 
   "TDB[25]" + "TDB[24]" + "TDB[23]" + "TDB[22]" + "TDB[21]" + "TDB[20]" + "TDB[19]" + 
   "TDB[18]" + "TDB[17]" + "TDB[16]" + "TDB[15]" + "TDB[14]" + "TDB[13]" + "TDB[12]" + 
   "TDB[11]" + "TDB[10]" + "TDB[9]" + "TDB[8]" + "TDB[7]" + "TDB[6]" + "TDB[5]" + 
   "TDB[4]" + "TDB[3]" + "TDB[2]" + "TDB[1]" + "TDB[0]" + "RET1N" + "SIA[1]" + "SIA[0]" + 
   "SEA" + "DFTRAMBYP" + "SIB[1]" + "SIB[0]" + "SEB" + "CRE1" + "CRE2" + "FCA1[4]" + 
   "FCA1[3]" + "FCA1[2]" + "FCA1[1]" + "FCA1[0]" + "FCA2[4]" + "FCA2[3]" + "FCA2[2]" + 
   "FCA2[1]" + "FCA2[0]" + "COLLDISN"';
   "all_outputs" = '"CENYA" + "AYA[6]" + "AYA[5]" + "AYA[4]" + "AYA[3]" + "AYA[2]" + 
   "AYA[1]" + "AYA[0]" + "CENYB" + "AYB[6]" + "AYB[5]" + "AYB[4]" + "AYB[3]" + "AYB[2]" + 
   "AYB[1]" + "AYB[0]" + "QA[63]" + "QA[62]" + "QA[61]" + "QA[60]" + "QA[59]" + "QA[58]" + 
   "QA[57]" + "QA[56]" + "QA[55]" + "QA[54]" + "QA[53]" + "QA[52]" + "QA[51]" + "QA[50]" + 
   "QA[49]" + "QA[48]" + "QA[47]" + "QA[46]" + "QA[45]" + "QA[44]" + "QA[43]" + "QA[42]" + 
   "QA[41]" + "QA[40]" + "QA[39]" + "QA[38]" + "QA[37]" + "QA[36]" + "QA[35]" + "QA[34]" + 
   "QA[33]" + "QA[32]" + "QA[31]" + "QA[30]" + "QA[29]" + "QA[28]" + "QA[27]" + "QA[26]" + 
   "QA[25]" + "QA[24]" + "QA[23]" + "QA[22]" + "QA[21]" + "QA[20]" + "QA[19]" + "QA[18]" + 
   "QA[17]" + "QA[16]" + "QA[15]" + "QA[14]" + "QA[13]" + "QA[12]" + "QA[11]" + "QA[10]" + 
   "QA[9]" + "QA[8]" + "QA[7]" + "QA[6]" + "QA[5]" + "QA[4]" + "QA[3]" + "QA[2]" + 
   "QA[1]" + "QA[0]" + "SOA[1]" + "SOA[0]" + "SOB[1]" + "SOB[0]"';
   "all_ports" = '"all_inputs" + "all_outputs"';
   "_pi" = '"CLKA" + "CENA" + "AA[6]" + "AA[5]" + "AA[4]" + "AA[3]" + "AA[2]" + "AA[1]" + 
   "AA[0]" + "CLKB" + "CENB" + "AB[6]" + "AB[5]" + "AB[4]" + "AB[3]" + "AB[2]" + 
   "AB[1]" + "AB[0]" + "DB[63]" + "DB[62]" + "DB[61]" + "DB[60]" + "DB[59]" + "DB[58]" + 
   "DB[57]" + "DB[56]" + "DB[55]" + "DB[54]" + "DB[53]" + "DB[52]" + "DB[51]" + "DB[50]" + 
   "DB[49]" + "DB[48]" + "DB[47]" + "DB[46]" + "DB[45]" + "DB[44]" + "DB[43]" + "DB[42]" + 
   "DB[41]" + "DB[40]" + "DB[39]" + "DB[38]" + "DB[37]" + "DB[36]" + "DB[35]" + "DB[34]" + 
   "DB[33]" + "DB[32]" + "DB[31]" + "DB[30]" + "DB[29]" + "DB[28]" + "DB[27]" + "DB[26]" + 
   "DB[25]" + "DB[24]" + "DB[23]" + "DB[22]" + "DB[21]" + "DB[20]" + "DB[19]" + "DB[18]" + 
   "DB[17]" + "DB[16]" + "DB[15]" + "DB[14]" + "DB[13]" + "DB[12]" + "DB[11]" + "DB[10]" + 
   "DB[9]" + "DB[8]" + "DB[7]" + "DB[6]" + "DB[5]" + "DB[4]" + "DB[3]" + "DB[2]" + 
   "DB[1]" + "DB[0]" + "EMAA[2]" + "EMAA[1]" + "EMAA[0]" + "EMASA" + "EMAB[2]" + 
   "EMAB[1]" + "EMAB[0]" + "TENA" + "TCENA" + "TAA[6]" + "TAA[5]" + "TAA[4]" + "TAA[3]" + 
   "TAA[2]" + "TAA[1]" + "TAA[0]" + "TENB" + "TCENB" + "TAB[6]" + "TAB[5]" + "TAB[4]" + 
   "TAB[3]" + "TAB[2]" + "TAB[1]" + "TAB[0]" + "TDB[63]" + "TDB[62]" + "TDB[61]" + 
   "TDB[60]" + "TDB[59]" + "TDB[58]" + "TDB[57]" + "TDB[56]" + "TDB[55]" + "TDB[54]" + 
   "TDB[53]" + "TDB[52]" + "TDB[51]" + "TDB[50]" + "TDB[49]" + "TDB[48]" + "TDB[47]" + 
   "TDB[46]" + "TDB[45]" + "TDB[44]" + "TDB[43]" + "TDB[42]" + "TDB[41]" + "TDB[40]" + 
   "TDB[39]" + "TDB[38]" + "TDB[37]" + "TDB[36]" + "TDB[35]" + "TDB[34]" + "TDB[33]" + 
   "TDB[32]" + "TDB[31]" + "TDB[30]" + "TDB[29]" + "TDB[28]" + "TDB[27]" + "TDB[26]" + 
   "TDB[25]" + "TDB[24]" + "TDB[23]" + "TDB[22]" + "TDB[21]" + "TDB[20]" + "TDB[19]" + 
   "TDB[18]" + "TDB[17]" + "TDB[16]" + "TDB[15]" + "TDB[14]" + "TDB[13]" + "TDB[12]" + 
   "TDB[11]" + "TDB[10]" + "TDB[9]" + "TDB[8]" + "TDB[7]" + "TDB[6]" + "TDB[5]" + 
   "TDB[4]" + "TDB[3]" + "TDB[2]" + "TDB[1]" + "TDB[0]" + "RET1N" + "SIA[1]" + "SIA[0]" + 
   "SEA" + "DFTRAMBYP" + "SIB[1]" + "SIB[0]" + "SEB" + "CRE1" + "CRE2" + "FCA1[4]" + 
   "FCA1[3]" + "FCA1[2]" + "FCA1[1]" + "FCA1[0]" + "FCA2[4]" + "FCA2[3]" + "FCA2[2]" + 
   "FCA2[1]" + "FCA2[0]" + "COLLDISN"';
   "_po" = '"CENYA" + "AYA[6]" + "AYA[5]" + "AYA[4]" + "AYA[3]" + "AYA[2]" + "AYA[1]" + 
   "AYA[0]" + "CENYB" + "AYB[6]" + "AYB[5]" + "AYB[4]" + "AYB[3]" + "AYB[2]" + "AYB[1]" + 
   "AYB[0]" + "QA[63]" + "QA[62]" + "QA[61]" + "QA[60]" + "QA[59]" + "QA[58]" + "QA[57]" + 
   "QA[56]" + "QA[55]" + "QA[54]" + "QA[53]" + "QA[52]" + "QA[51]" + "QA[50]" + "QA[49]" + 
   "QA[48]" + "QA[47]" + "QA[46]" + "QA[45]" + "QA[44]" + "QA[43]" + "QA[42]" + "QA[41]" + 
   "QA[40]" + "QA[39]" + "QA[38]" + "QA[37]" + "QA[36]" + "QA[35]" + "QA[34]" + "QA[33]" + 
   "QA[32]" + "QA[31]" + "QA[30]" + "QA[29]" + "QA[28]" + "QA[27]" + "QA[26]" + "QA[25]" + 
   "QA[24]" + "QA[23]" + "QA[22]" + "QA[21]" + "QA[20]" + "QA[19]" + "QA[18]" + "QA[17]" + 
   "QA[16]" + "QA[15]" + "QA[14]" + "QA[13]" + "QA[12]" + "QA[11]" + "QA[10]" + "QA[9]" + 
   "QA[8]" + "QA[7]" + "QA[6]" + "QA[5]" + "QA[4]" + "QA[3]" + "QA[2]" + "QA[1]" + 
   "QA[0]" + "SOA[1]" + "SOA[0]" + "SOB[1]" + "SOB[0]"';
   "_si" = '"SIA[0]" + "SIA[1]" + "SIB[0]" + "SIB[1]"' {ScanIn; }
   "_so" = '"SOA[0]" + "SOA[1]" + "SOB[0]" + "SOB[1]"' {ScanOut; }
}
ScanStructures {
   ScanChain "chain_rd2_128x64_wm0_1" {
      ScanLength  32;
      ScanCells   "uDQA31" "uDQA30" "uDQA29" "uDQA28" "uDQA27" "uDQA26" "uDQA25" "uDQA24" "uDQA23" "uDQA22" "uDQA21" "uDQA20" "uDQA19" "uDQA18" "uDQA17" "uDQA16" "uDQA15" "uDQA14" "uDQA13" "uDQA12" "uDQA11" "uDQA10" "uDQA9" "uDQA8" "uDQA7" "uDQA6" "uDQA5" "uDQA4" "uDQA3" "uDQA2" "uDQA1" "uDQA0" ;
      ScanIn  "SIA[0]";
      ScanOut  "SOA[0]";
      ScanEnable  "SEA";
      ScanMasterClock  "CLKA";
   }
   ScanChain "chain_rd2_128x64_wm0_2" {
      ScanLength  32;
      ScanCells  "uDQA32" "uDQA33" "uDQA34" "uDQA35" "uDQA36" "uDQA37" "uDQA38" "uDQA39" "uDQA40" "uDQA41" "uDQA42" "uDQA43" "uDQA44" "uDQA45" "uDQA46" "uDQA47" "uDQA48" "uDQA49" "uDQA50" "uDQA51" "uDQA52" "uDQA53" "uDQA54" "uDQA55" "uDQA56" "uDQA57" "uDQA58" "uDQA59" "uDQA60" "uDQA61" "uDQA62" "uDQA63"  ;
      ScanIn  "SIA[1]";
      ScanOut  "SOA[1]";
      ScanEnable  "SEA";
      ScanMasterClock  "CLKA";
   }
   ScanChain "chain_rd2_128x64_wm0_3" {
      ScanLength  32;
      ScanCells   "uDQB31" "uDQB30" "uDQB29" "uDQB28" "uDQB27" "uDQB26" "uDQB25" "uDQB24" "uDQB23" "uDQB22" "uDQB21" "uDQB20" "uDQB19" "uDQB18" "uDQB17" "uDQB16" "uDQB15" "uDQB14" "uDQB13" "uDQB12" "uDQB11" "uDQB10" "uDQB9" "uDQB8" "uDQB7" "uDQB6" "uDQB5" "uDQB4" "uDQB3" "uDQB2" "uDQB1" "uDQB0" ;
      ScanIn  "SIB[0]";
      ScanOut  "SOB[0]";
      ScanEnable  "SEB";
      ScanMasterClock  "CLKB";
   }
   ScanChain "chain_rd2_128x64_wm0_4" {
      ScanLength  32;
      ScanCells  "uDQB32" "uDQB33" "uDQB34" "uDQB35" "uDQB36" "uDQB37" "uDQB38" "uDQB39" "uDQB40" "uDQB41" "uDQB42" "uDQB43" "uDQB44" "uDQB45" "uDQB46" "uDQB47" "uDQB48" "uDQB49" "uDQB50" "uDQB51" "uDQB52" "uDQB53" "uDQB54" "uDQB55" "uDQB56" "uDQB57" "uDQB58" "uDQB59" "uDQB60" "uDQB61" "uDQB62" "uDQB63"  ;
      ScanIn  "SIB[1]";
      ScanOut  "SOB[1]";
      ScanEnable  "SEB";
      ScanMasterClock  "CLKB";
   }
}
Timing {
   WaveformTable "_default_WFT_" {
      Period '100ns';
      Waveforms {
         "all_inputs" {
            01ZN { '0ns' D/U/Z/N; }
         }
         "all_outputs" {
            XHTL { '40ns' X/H/T/L; }
         }
         "CLKA" {
            P { '0ns' D; '45ns' U; '55ns' D; }
         }
         "CLKB" {
            P { '0ns' D; '45ns' U; '55ns' D; }
         }
      }
   }
}
Procedures {
   "capture" {
      W "_default_WFT_";
      V { "_pi" = #; "_po" = #; }
   }
   "capture_CLK" {
      W "_default_WFT_";
      V {"_pi" = #; "_po" = #;"CLKA" = P;"CLKB" = P; }
   }
   "load_unload" {
      W "_default_WFT_";
      V { "CLKA" = 0; "CLKB" = 0; "_si" = \r4 N; "_so" =\r4 X; "SEA" = 1; "SEB" = 1; "DFTRAMBYP" = 1; }
      Shift {
         V { "CLKA" = P; "CLKB" = P; "_si" = \r4 #; "_so" = \r4 #; }
      }
   }
}
MacroDefs {
   "test_setup" {
      W "_default_WFT_";
      C {"all_inputs" = \r192 N; "all_outputs" = \r84 X; }
      V { "CLKA" = P; "CLKB" = P; }
   }
}
Environment "rd2_128x64_wm0" {
   CTL {
   }
   CTL Internal_scan {
      TestMode InternalTest;
      Focus Top {
      }
      Internal {
         "SIA[0]" {
            CaptureClock "CLKA" {
               LeadingEdge;
            }
            DataType ScanDataIn {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SIA[1]" {
            CaptureClock "CLKA" {
               LeadingEdge;
            }
            DataType ScanDataIn {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SOA[0]" {
            LaunchClock "CLKA" {
               LeadingEdge;
            }
            DataType ScanDataOut {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SOA[1]" {
            LaunchClock "CLKA" {
               LeadingEdge;
            }
            DataType ScanDataOut {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SEA" {
            DataType ScanEnable {
               ActiveState ForceUp;
            }
         }
         "CLKA" {
            DataType ScanMasterClock MasterClock;
         }
         "SIB[0]" {
            CaptureClock "CLKB" {
               LeadingEdge;
            }
            DataType ScanDataIn {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SIB[1]" {
            CaptureClock "CLKB" {
               LeadingEdge;
            }
            DataType ScanDataIn {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SOB[0]" {
            LaunchClock "CLKB" {
               LeadingEdge;
            }
            DataType ScanDataOut {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SOB[1]" {
            LaunchClock "CLKB" {
               LeadingEdge;
            }
            DataType ScanDataOut {
               ScanDataType Internal;
            }
            ScanStyle MultiplexedData;
         }
         "SEB" {
            DataType ScanEnable {
               ActiveState ForceUp;
            }
         }
         "CLKB" {
            DataType ScanMasterClock MasterClock;
         }
      }
   }
}
Environment dftSpec {
   CTL {
   }
   CTL all_dft {
      TestMode ForInheritOnly;
   }
}


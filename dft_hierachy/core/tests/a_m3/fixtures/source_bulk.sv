`define A_FOUR(P) wire P``0; wire P``1; wire P``2; wire P``3;
`define A_SIXTEEN(P) `A_FOUR(P``0) `A_FOUR(P``1) `A_FOUR(P``2) `A_FOUR(P``3)
`define A_64(P) `A_SIXTEEN(P``0) `A_SIXTEEN(P``1) `A_SIXTEEN(P``2) `A_SIXTEEN(P``3)
`define A_256(P) `A_64(P``0) `A_64(P``1) `A_64(P``2) `A_64(P``3)
`define A_1024(P) `A_256(P``0) `A_256(P``1) `A_256(P``2) `A_256(P``3)
module source_bulk;
    `A_1024(v)
endmodule

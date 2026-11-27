module iopad_sel (I,Y,SEL);
input I,SEL;
output Y;

        and02 pand_inst (.A0(I), .A1(SEL), .Y(Y));
        
endmodule

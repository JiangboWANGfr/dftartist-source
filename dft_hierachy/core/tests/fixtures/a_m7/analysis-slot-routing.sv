module route_n(input a, output y);
    assign y = a;
endmodule
module route_i(input a, output y);
    assign y = ~a;
endmodule
module route_wrap(input [7:0] a, output [7:0] y);
    route_n lanes[2:-1](a[3:0], y[3:0]);
    for (genvar i=0; i<4; i++) begin:g
        wire unused;
        and gate0(unused, a[i+4], 1'b1);
        if (i % 2 == 0) begin:n
            route_n u(a[i+4], y[i+4]);
        end else begin:v
            route_i u(a[i+4], y[i+4]);
        end
    end
endmodule
module route_top(input [7:0] a, output [7:0] y,z);
    route_wrap first(a,y), second(a,z);
endmodule

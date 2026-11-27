
#!/user/local/bin/perl
use strict;
use warnings;

my $module_name;
my @output_pins;
my @input_pins;

# Â½Ã¢ÃÃ¶module_info.txt
open my $info_fh, '<', 'module_info' or die $!;
while (<$info_fh>) {
    chomp;
    if (/^module_name:\s*$/) {
        while (<$info_fh>) {
            next if /^\s*$/;
            if (/-\s+(\w+)/) {
                $module_name = $1;
                last;
            }
        }
    } elsif (/^output_pin_name:\s*$/) {
        while (<$info_fh>) {
            last if /^\s*$/;
            if (/-\s+(.*)?\s*(\[\d+:\d+\])?/) {
                my $pin = $1 . (defined $2 ? " $2" : "");
                push @output_pins, $pin;
            }
        }
    } elsif (/^input_pin_name:\s*$/) {
        while (<$info_fh>) {
            last if /^\s*$/;
            if (/-\s+(.*)?\s*(\[\d+:\d+\])?/) {
                my $pin = $1 . (defined $2 ? " $2" : "");
                push @input_pins, $pin;
            }
        }
    }
}
close $info_fh;

# Â½Ã¢ÃÃ¶ÃÃ½Â½ÃÃÃ»Â³ÃÂºÃÃÂ»Â¿Ã­
sub parse_pin {
    my ($pin) = @_;
    my ($name, $width) = $pin =~ /^(\S+)(?:\s+(\[[\d:]+\]))?/;
    $width //= '';
    return ($name, $width);
}

# ÃÃºÂ³Ã.iclÃÃÂ¼Ã¾
open my $icl_fh, '>', "$module_name.icl" or die $!;
print $icl_fh "Module $module_name {\n";
foreach my $pin (@output_pins) {
    my ($name, $width) = parse_pin($pin);
    my $tdr = "${name}_tdr";
    my $default = ($width eq '') ? "1'b0" : "0";
    print $icl_fh "  DataInPort  $tdr$width {DefaultLoadValue $default;}\n";
}
foreach my $pin (@input_pins) {
    my ($name, $width) = parse_pin($pin);
    my $tdr = "${name}_tdr";
    print $icl_fh "  DataOutPort  $tdr$width {}\n";
}
print $icl_fh "}\n";
close $icl_fh;

# ÃÃºÂ³Ã.vÃÃÂ¼Ã¾
open my $v_fh, '>', "$module_name.v" or die $!;
print $v_fh "module $module_name (\n";

# ÃÃ¤ÃÃ«Â¶ÃÂ¿ÃÂ£Âºoutput_pins + _tdr, dfx_mode, input_pins
my @inputs;
foreach my $pin (@output_pins) {
    my ($name, $width) = parse_pin($pin);
    my $tdr = "${name}_tdr";
    push @inputs, "input wire $width $tdr";
}
push @inputs, "input wire dfx_mode";
foreach my $pin (@input_pins) {
    my ($name, $width) = parse_pin($pin);
    push @inputs, "input wire $width $name";
}

# ÃÃ¤Â³Ã¶Â¶ÃÂ¿ÃÂ£Âºoutput_pins, input_pins + _tdr
my @outputs;
foreach my $pin (@output_pins) {
    my ($name, $width) = parse_pin($pin);
    push @outputs, "output wire $width $name";
}
foreach my $pin (@input_pins) {
    my ($name, $width) = parse_pin($pin);
    my $tdr = "${name}_tdr";
    push @outputs, "output wire $width $tdr";
}

# ÂºÃÂ²Â¢ÃÃ¹ÃÃÂ¶ÃÂ¿ÃÂ²Â¢Â´Â¦ÃÃ­Â¶ÂºÂºÃ
my @all_ports = (@inputs, @outputs);
for (my $i=0; $i<@all_ports; $i++) {
    $all_ports[$i] .= ($i == $#all_ports) ? '' : ',';
    print $v_fh "  $all_ports[$i]\n";
}

print $v_fh ");\n\n";

# ÃÃºÂ³Ãoutput_pinsÃÃÂ¼Â­
foreach my $pin (@output_pins) {
    my ($name, $width) = parse_pin($pin);
    my $tdr = "${name}_tdr";
    if ($width eq '') {
        print $v_fh "cell_and2 ${name}_persistent_and2_inst (.Z($name), .A1($tdr), .A2(dfx_mode));\n";
    } else {
        my ($msb, $lsb) = $width =~ /\[(\d+):(\d+)\]/;
        my $size = $msb - $lsb + 1;
        print $v_fh <<"END_GEN";
generate
genvar i_${name};
for(i_${name}=0; i_${name}<$size; i_${name}=i_${name}+1) begin: ${name}_gen
    cell_and2 ${name}_persistent_and2_inst (.Z($name\[i_${name}\]), .A1($tdr\[i_${name}\]), .A2(dfx_mode));
end
endgenerate

END_GEN
    }
}

# ÃÃºÂ³Ãinput_pinsÃÃÂ¼Â­
foreach my $pin (@input_pins) {
    my ($name, $width) = parse_pin($pin);
    my $tdr = "${name}_tdr";
    if ($width eq '') {
        print $v_fh "cell_and2 ${name}_persistent_and2_inst (.Z($tdr), .A1($name), .A2(dfx_mode));\n";
    } else {
        my ($msb, $lsb) = $width =~ /\[(\d+):(\d+)\]/;
        my $size = $msb - $lsb + 1;
        print $v_fh <<"END_GEN";
generate
genvar i_${name};
for(i_${name}=0; i_${name}<$size; i_${name}=i_${name}+1) begin: ${name}_gen
    cell_and2 ${name}_persistent_and2_inst (.Z($tdr\[i_${name}\]), .A1($name\[i_${name}\]), .A2(dfx_mode));
end
endgenerate

END_GEN
    }
}

print $v_fh "endmodule\n";
close $v_fh;

print "Generated $module_name.icl and $module_name.v successfully.\n";


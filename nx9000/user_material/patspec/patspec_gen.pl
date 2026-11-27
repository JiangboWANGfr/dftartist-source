#!/usr/bin/perl
use strict;
use warnings;

# ¶ÁÈ¡controllerÁÐ±í
open my $cl_fh, '<', 'aa' or die "ÎÞ·¨´ò¿ªcontroller_list.txt: $!";
my @controllers = <$cl_fh>;
close $cl_fh;
chomp @controllers;

# ¶ÁÈ¡start.txtÄÚÈÝ
open my $in_fh, '<', 'aa_mbist_spec' or die "ÎÞ·¨´ò¿ªstart.txt: $!";
my @lines = <$in_fh>;
close $in_fh;

my $i = 0;
while ($i <= $#lines) {
    if ($lines[$i] =~ /^(\s*)Controller\(\*\)/) {
        my $indent = $1;
        my $start_idx = $i;

        # ÌáÈ¡Õû¸öController(*)¿é
        my @block;
        my $braces = 0;
        do {
            push @block, $lines[$i];
            $braces += ($lines[$i] =~ tr/{//) - ($lines[$i] =~ tr/}//);
            $i++;
        } while ($braces > 0 && $i <= $#lines);

        # ÎªÃ¿¸ö¿ØÖÆÆ÷Éú³ÉÌæ»»¿é
        my @replacement;
        foreach my $ctrl (@controllers) {
            # Ìæ»»Ê×ÐÐ¿ØÖÆÆ÷Ãû³Æ
            my $first_line = $block[0];
            $first_line =~ s/Controller\(\*\)/Controller($ctrl)/;

            # ±£³ÖºóÐøÐÐµÄ½á¹¹
            my @ctrl_block = ($first_line);
            push @ctrl_block, @block[1..$#block];
            push @replacement, @ctrl_block;
        }

        # Ìæ»»Ô­Ê¼¿é
        splice @lines, $start_idx, scalar(@block), @replacement;
        $i = $start_idx + scalar(@replacement);
    } else {
        $i++;
    }
}

# Ð´Èëfinal.txt
open my $out_fh, '>', 'final.txt' or die "ÎÞ·¨´´½¨final.txt: $!";
print $out_fh @lines;
close $out_fh;

print "³É¹¦Éú³Éfinal.txt\n";

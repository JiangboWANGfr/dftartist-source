#!/usr/bin/perl
use strict;
use warnings;
use YAML::XS;
use Data::Dumper;

# 检查命令行参数
if (@ARGV != 1) {
    die "用法: $0 <yaml文件路径>\n示例: $0 config.yaml\n";
}

my $yaml_file = $ARGV[0];

# 检查文件是否存在
unless (-f $yaml_file) {
    die "错误: 文件 '$yaml_file' 不存在或无法访问\n";
}

# 读取并解析YAML文件
my $yaml_data;
eval {
    $yaml_data = YAML::XS::LoadFile($yaml_file);
};
if ($@) {
    die "解析YAML失败: $@\n";
}

# 转换Perl数据结构为TCL字典
sub perl_to_tcl {
    my ($data, $indent) = @_;
    $indent //= 0;
    my $indent_str = '  ' x $indent;
    my $tcl_str = '';

    # 处理哈希（对应TCL字典）
    if (ref($data) eq 'HASH') {
        $tcl_str .= "{\n";
        foreach my $key (sort keys %$data) {
            my $escaped_key = escape_tcl_string($key);
            my $value = perl_to_tcl($data->{$key}, $indent + 1);
            $tcl_str .= "${indent_str}  ${escaped_key} $value\n";
        }
        $tcl_str .= "${indent_str}}";
    }
    # 处理数组（转换为带数字索引的TCL字典）
    elsif (ref($data) eq 'ARRAY') {
        $tcl_str .= "{\n";
        for (my $i = 0; $i < @$data; $i++) {
            my $value = perl_to_tcl($data->[$i], $indent + 1);
            $tcl_str .= "${indent_str}  $i $value\n";
        }
        $tcl_str .= "${indent_str}}";
    }
    # 处理标量值
    else {
        $tcl_str = escape_tcl_string($data);
    }

    return $tcl_str;
}

# TCL字符串转义处理
sub escape_tcl_string {
    my ($str) = @_;

    # 处理undef值
    return '""' unless defined $str;

    # 转换特殊字符
    $str =~ s/\\/\\\\/g;  # 反斜杠
    $str =~ s/"/\\"/g;    # 双引号
    $str =~ s/\$/\\\$/g;  # 美元符号
    $str =~ s/\[/\\\[/g;  \# 左方括号
    $str =~ s/\]/\\\]/g;  # 右方括号

    # 对包含空格/特殊字符的字符串添加引号
    if ($str =~ /\s|["\$\[\]]/) {
        $str = "\"$str\"";
    }

    # 空字符串处理
    $str = '""' if $str eq '';

    return $str;
}

# 生成TCL字典
my $tcl_dict = perl_to_tcl($yaml_data);

# 输出结果（也可以写入文件）
print "# 自动生成的TCL字典 - 从 $yaml_file 转换\n";
print "set config_dict $tcl_dict\n\n";

# 可选：将结果写入TCL文件
my $tcl_file = $yaml_file;
$tcl_file =~ s/\.ya?ml$/.tcl/i;
open my $fh, '>', $tcl_file or die "无法写入文件 $tcl_file: $!";
print $fh "# 自动生成的TCL字典 - 从 $yaml_file 转换\n";
print $fh "set config_dict $tcl_dict\n";
close $fh;

print "转换完成！\n";
print "YAML文件: $yaml_file\n";
print "TCL文件: $tcl_file\n";

exit 0;

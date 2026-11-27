#!/usr/bin/env python3
import yaml
import sys
import os
import re
import argparse

def escape_tcl_string(s):
    """
    对TCL字符串进行特殊字符转义处理
    :param s: 原始字符串
    :return: 转义后的TCL字典字符串
    """
    # 处理None值
    if s is None:
        return '""'
    
    # 转换为字符串类型（处理数字、布尔值等）
    str_val = str(s)
    
    # 转义TCL特殊字符
    escape_map = {
        "\\": "\\\\",  # 反斜杠
        '"': '\\"',    # 双引号
        "$": "\\$",    # 美元符号
        "[": "\\[",    # 左方括号
        "]": "\\]"     # 右方括号
    }
    
    # 应用转义
    for char, escaped_char in escape_map.items():
        str_val = str_val.replace(char, escaped_char)
    
    # 对包含空格/特殊字符的字符串添加引号
    if re.search(r'\s|["\$\[\]]', str_val):
        str_val = f'"{str_val}"'
    
    # 空字符串处理
    if str_val == '':
        str_val = '""'
    
    return str_val

def python_to_tcl(data, indent=0):
    """
    递归将Python数据结构转换为TCL字典格式
    :param data: Python数据（dict/list/str/int/bool等）
    :param indent: 缩进级别，用于格式化输出
    :return: TCL字典字符串
    """
    indent_str = '  ' * indent
    tcl_str = ''
    
    # 处理字典（对应TCL字典）
    if isinstance(data, dict):
        tcl_str += "{\n"
        # 按key排序，保证输出顺序稳定
        for key in sorted(data.keys()):
            escaped_key = escape_tcl_string(key)
            value = python_to_tcl(data[key], indent + 1)
            tcl_str += f"{indent_str}  {escaped_key} {value}\n"
        tcl_str += f"{indent_str}}}"
    
    # 处理列表（转换为带数字索引的TCL字典）
    elif isinstance(data, list):
        tcl_str += "{\n"
        for idx, item in enumerate(data):
            value = python_to_tcl(item, indent + 1)
            tcl_str += f"{indent_str}  {idx} {value}\n"
        tcl_str += f"{indent_str}}}"
    
    # 处理标量值（字符串、数字、布尔值等）
    else:
        tcl_str = escape_tcl_string(data)
    
    return tcl_str

def yaml_to_tcl(yaml_file_path, tcl_file_path=None):
    """
    主函数：读取YAML文件并转换为TCL字典
    :param yaml_file_path: 输入YAML文件路径
    :param tcl_file_path: 输出TCL文件路径（可选，默认自动生成）
    """
    # 检查输入文件是否存在
    if not os.path.exists(yaml_file_path):
        print(f"错误：输入YAML文件 '{yaml_file_path}' 不存在！")
        sys.exit(1)
    
    # 读取并解析YAML文件
    try:
        with open(yaml_file_path, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)
        
        if yaml_data is None:
            print("警告：YAML文件为空！")
            yaml_data = {}
    
    except yaml.YAMLError as e:
        print(f"解析YAML文件失败：{e}")
        sys.exit(1)
    except Exception as e:
        print(f"读取YAML文件失败：{e}")
        sys.exit(1)
    
    # 转换为TCL字典
    tcl_dict = python_to_tcl(yaml_data)
    
    # 确定输出文件路径
    if not tcl_file_path:
        # 自动生成：替换后缀为.tcl
        tcl_file_path = re.sub(r'\.ya?ml$', '.tcl', yaml_file_path, flags=re.IGNORECASE)
        if tcl_file_path == yaml_file_path:
            tcl_file_path = f"{yaml_file_path}.tcl"
    
    # 写入TCL文件
    try:
        with open(tcl_file_path, 'w', encoding='utf-8') as f:
            f.write(f"# 自动生成的TCL字典 - 从 {yaml_file_path} 转换\n")
            f.write(f"set config_dict {tcl_dict}\n")
    except Exception as e:
        print(f"写入TCL文件失败：{e}")
        sys.exit(1)
    
    # 控制台输出结果
    print("=" * 60)
    print("YAML 转 TCL 字典 转换完成！")
    print(f"📥 输入YAML文件：{yaml_file_path}")
    print(f"📤 输出TCL文件：{tcl_file_path}")
    print("=" * 60)
    print("# 生成的TCL字典内容预览：")
    print(f"set config_dict {tcl_dict[:200]}...\n")

def main():
    # 创建命令行参数解析器
    parser = argparse.ArgumentParser(
        description='将YAML文件转换为TCL字典格式的工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例：
  1. 基础用法（自动生成输出文件）：
     python %(prog)s -yaml ./asic_top/dft_env_cfg.yaml
     
  2. 指定输出文件：
     python %(prog)s -yaml ./asic_top/dft_env_cfg.yaml -tcl_dict ./output/asic_top_dict.tcl
     
  3. 兼容原有位置参数用法：
     python %(prog)s ./asic_top/dft_env_cfg.yaml
        """
    )
    
    # 添加命令行参数
    parser.add_argument('-yaml', '--yaml-file', 
                        dest='yaml_file',
                        help='输入的YAML文件路径（必选）')
    parser.add_argument('-tcl_dict', '--tcl-file',
                        dest='tcl_file',
                        help='输出的TCL字典文件路径（可选，默认自动生成）')
    # 兼容原有位置参数
    parser.add_argument('positional_yaml', nargs='?',
                        help=argparse.SUPPRESS)
    
    # 解析参数
    args = parser.parse_args()
    
    # 处理参数优先级：显式指定的 -yaml 优先于位置参数
    yaml_file = args.yaml_file or args.positional_yaml
    if not yaml_file:
        parser.print_help()
        print("\n错误：必须指定 -yaml 参数或传入YAML文件路径作为位置参数！")
        sys.exit(1)
    
    # 执行转换
    yaml_to_tcl(yaml_file, args.tcl_file)

if __name__ == "__main__":
    main()

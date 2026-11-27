#!/usr/bin/env python3
import yaml
import sys
import os
import re

def escape_tcl_string(s):
    """
    对TCL字符串进行特殊字符转义处理
    :param s: 原始字符串
    :return: 转义后的TCL字符串
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

def yaml_to_tcl(yaml_file_path):
    """
    主函数：读取YAML文件并转换为TCL字典
    :param yaml_file_path: YAML文件路径
    """
    # 检查文件是否存在
    if not os.path.exists(yaml_file_path):
        print(f"错误：文件 '{yaml_file_path}' 不存在！")
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
    
    # 生成输出文件名（替换后缀为.tcl）
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
    print("=" * 50)
    print("转换完成！")
    print(f"源YAML文件：{yaml_file_path}")
    print(f"生成TCL文件：{tcl_file_path}")
    print("=" * 50)
    print("# 生成的TCL字典内容：")
    print(f"set config_dict {tcl_dict}\n")

if __name__ == "__main__":
    # 检查命令行参数
    if len(sys.argv) != 2:
        print("用法：")
        print(f"  python {sys.argv[0]} <yaml文件路径>")
        print("示例：")
        print(f"  python {sys.argv[0]} config.yaml")
        sys.exit(1)
    
    # 执行转换
    yaml_to_tcl(sys.argv[1])

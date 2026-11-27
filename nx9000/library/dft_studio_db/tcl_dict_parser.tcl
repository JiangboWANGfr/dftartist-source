#!/usr/bin/tclsh
# TCL字典解析工具 - 适配从YAML转换的design_config字典

# ===================== 核心解析函数 =====================
# 1. 安全读取字典中指定路径的值（支持多级路径）
# 参数: 
#   dict_name - 字典变量名
#   keys      - 键路径列表（如 {design_manager design_name}）
# 返回: 对应值（若路径不存在返回空字符串）
proc get_dict_value {dict_name keys} {
    upvar $dict_name dict_data
    set current_data $dict_data
    
    foreach key $keys {
        # 检查当前层级是否包含该键
        if {![dict exists $current_data $key]} {
            puts "警告：字典路径 [join $keys /] 中键 '$key' 不存在！"
            return ""
        }
        set current_data [dict get $current_data $key]
    }
    
    return $current_data
}

# 2. 递归遍历字典并打印（带缩进，美观输出）
# 参数:
#   dict_data - 字典数据
#   indent    - 缩进级别（默认0）
proc print_dict {dict_data {indent 0}} {
    set indent_str [string repeat "  " $indent]
    
    # 遍历字典的每个键值对
    dict for {key value} $dict_data {
        # 判断值是否为嵌套字典
        if {[string index $value 0] eq "{" && [string index $value end] eq "}"} {
            puts "${indent_str}$key:"
            print_dict $value [expr {$indent + 1}]
        } else {
            # 处理列表（数字索引的字典）
            if {[string is integer -strict $key] && [dict size $dict_data] == [llength [dict keys $dict_data]]} {
                puts "${indent_str}- $value"
            } else {
                puts "${indent_str}$key = $value"
            }
        }
    }
}

# 3. 查询字典中包含指定关键词的所有键值对
# 参数:
#   dict_data - 字典数据
#   keyword   - 要查询的关键词
#   indent    - 缩进级别（内部使用）
proc search_dict {dict_data keyword {indent 0}} {
    set indent_str [string repeat "  " $indent]
    set found 0
    
    dict for {key value} $dict_data {
        # 检查键或值是否包含关键词
        if {[string match "*$keyword*" $key] || [string match "*$keyword*" $value]} {
            puts "${indent_str}匹配项: $key = $value"
            set found 1
        }
        
        # 递归搜索嵌套字典
        if {[string index $value 0] eq "{" && [string index $value end] eq "}"} {
            set sub_found [search_dict $value $keyword [expr {$indent + 1}]]
            if {$sub_found} {set found 1}
        }
    }
    
    return $found
}

# ===================== 核心查找 Proc =====================
# 功能：查找指定路径下指定后缀的文件，返回文件路径列表
# 参数：
#   target_path  - 必选，目标查找路径（绝对/相对路径均可）
#   file_suffix  - 必选，文件后缀（支持单个：".v"；多个：".v .mdt .tcl"；无点："v mdt"）
#   recursive    - 可选，是否递归查找子目录（1=递归，0=仅当前目录，默认1）
# 返回值：
#   成功：符合条件的文件完整路径列表（list 类型）
#   失败：空列表 + 控制台输出错误信息
proc find_files {target_path file_suffix {recursive 1}} {
    # ---------------- 步骤1：参数校验 ----------------
    # 校验目标路径是否存在且为目录
    if {![file exists $target_path]} {
        puts "【错误】目标路径不存在：$target_path"
        return [list]
    }
    if {![file isdirectory $target_path]} {
        puts "【错误】指定路径不是目录：$target_path"
        return [list]
    }
    
    # 校验后缀参数非空
    if {[string trim $file_suffix] eq ""} {
        puts "【错误】文件后缀参数不能为空"
        return [list]
    }
    
    # ---------------- 步骤2：处理后缀格式 ----------------
    # 统一后缀格式（自动补全点，比如 "v" → ".v"，".mdt" 保持不变）
    set suffix_list [list]
    foreach suf [split [string trim $file_suffix] " "] {
        if {$suf ne ""} {
            if {[string index $suf 0] ne "."} {
                lappend suffix_list ".${suf}"
            } else {
                lappend suffix_list $suf
            }
        }
    }
    
    # ---------------- 步骤3：查找文件 ----------------
    # 构建 glob 命令参数（-nocomplain 避免无匹配时报错）
    set glob_args [list -nocomplain -directory $target_path]
    if {$recursive} {
        lappend glob_args -recursive
    }
    lappend glob_args "*"  ;# 匹配所有文件/目录
    
    # 执行查找，获取路径列表
    set all_paths [eval glob $glob_args]
    set result_files [list]
    
    # ---------------- 步骤4：筛选指定后缀的文件 ----------------
    foreach path $all_paths {
        # 跳过目录，只处理文件
        if {[file isfile $path]} {
            set ext [file extension $path]  ;# 获取文件后缀（带点，如 ".v"）
            if {$ext in $suffix_list} {
                # 转换为绝对路径（避免相对路径歧义）
                lappend result_files [file normalize $path]
            }
        }
    }
    
    # ---------------- 步骤5：返回结果 ----------------
    if {[llength $result_files] == 0} {
        puts "【提示】路径 '$target_path' 下未找到后缀为 '$file_suffix' 的文件"
    } else {
        puts "【成功】路径 '$target_path' 下找到 [llength $result_files] 个符合条件的文件"
    }
    return $result_files
}
stop
# ===================== 示例：解析设计配置字典 =====================
# 1. 加载之前生成的TCL字典文件（替换为你的实际路径）
source ./asic_top_dict.tcl
puts "===== 加载的原始字典 ====="
puts $config_dict

# 2. 基础读取：获取单个配置项
set design_name [get_dict_value config_dict {design_manager design_name}]
puts "设计名称: $design_name"

set blackboxdict [get_dict_value config_dict {design_manager blackbox}]
set blackboxlist ""
foreach dictkey [dict keys $blackboxdict] {
    set dictvalue [dict get $blackboxlist $dictkey]
    lappend blackboxlist $dictvalue
}

set std_cell_path [get_dict_value config_dict {lib_manager standard_cell path 0}]
puts "标准单元路径: $std_cell_path"

# 读取内存postfix第二个项
set mem_postfix [get_dict_value config_dict {lib_manager memory postfix 1}]
puts "内存postfix第二项: $mem_postfix"
puts "\n"

# 3. 美观打印整个字典
puts "===== 格式化打印完整字典 ====="
print_dict $config_dict
puts "\n"

# 4. 搜索包含指定关键词的配置
puts "===== 搜索包含'path'的配置项 ====="
set found [search_dict $config_dict "path"]
if {!$found} {
    puts "未找到包含'path'的配置项"
}

puts "\n===== 搜索包含'mdt'的配置项 ====="
search_dict $config_dict "mdt"

# 5. 批量读取多个配置项示例
puts "\n===== 批量读取设计配置 ====="
set config_items {
    {design_manager design_filelist}
    {design_manager design_level}
    {lib_manager pad post_fix 0}
    {lib_manager tcd_scan postfix 0}
}

foreach item $config_items {
    set value [get_dict_value config_dict $item]
    puts "[join $item /] = $value"
}

# 6. 修改字典值（可选）
puts "\n===== 修改字典值示例 ====="
# 修改design_name
dict set config_dict design_manager design_name "asic_top_modified"
set new_design_name [get_dict_value config_dict {design_manager design_name}]
puts "修改后的设计名称: $new_design_name"

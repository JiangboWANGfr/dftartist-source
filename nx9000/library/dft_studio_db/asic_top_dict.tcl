# 自动生成的TCL字典 - 从 ./asic_top/dft_env_cfg.yaml 转换
set config_dict {
  design_manager {
    blackbox {
      0 LVDS_TX_RX_IO_TOP
      1 NNS28NHKCEDPAUX_1M_18FN1
      2 NNS28NHKCU2OPHY_P3_18FN1
    }
    design_filelist /prj/PnR910/workareas/nanocad/liuqi/LSW_DFT_1221/design/asic_top/asic_top_flat.vc
    design_level physical_block
    design_name asic_top
    design_type hierarchical
    exclude_syntehsis "\[list DW_minmax*\]"
    sharebus False
    sub_harden {
      0 pc_cpu_top
      1 cpu0_sys
      2 cpu_sys
      3 pc_top
      4 ddr_sub
    }
  }
  lib_manager {
    algo {
      path {
        0 "\$prj_dir/user_material/mentor_dft"
      }
      postfix {
        0 *.mdt
        1 *.v
      }
    }
    memory {
      interface_only True
      path {
        0 "\$prj_dir/user_material/mentor_dft"
      }
      postfix {
        0 *.lvlib
        1 *.tcd_core_description
        2 *.v
      }
    }
    pad {
      path {
        0 "\$prj_dir/user_material/pad_lib"
      }
      post_fix {
        0 *.mdt
        1 *.v
      }
    }
    standard_cell {
      interface_only True
      path {
        0 "\$prj_dir/user_material/mentor_dft"
      }
      postfix {
        0 *.mdt
        1 *.v
      }
    }
    tcd_bscan {
      path {
        0 "\$prj_dir/user_material/mentor_dft"
      }
      postfix {
        0 *.mdt
      }
    }
    tcd_scan {
      path {
        0 "\$prj_dir/user_material/mentor_dft"
      }
      postfix {
        0 *.mdt
      }
    }
  }
}

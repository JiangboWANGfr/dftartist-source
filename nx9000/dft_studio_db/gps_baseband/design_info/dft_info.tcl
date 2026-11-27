set dft_info [dict create \
    design_level  physical_block \
    design_name   processor_core \
    design_type   hierarchical \
    filelist      {/home/wongw/nx9000/design/processor_core/processor_core.vc} \
    rtl_or_gate   rtl \
    dftfuse       off \
    release_dir   {/home/wongw/dft_release} \
    feature       [dict create mbist 1 boundary_scan 0 ist 0 tap 0 mbisr_controller 0 mbisr_chain 1 edt 1 occ 1 ssn 1 lbist 0] \
    flow          [dict create mbist 1 logic_test 1 scan 1 atpg 1 retarget 0 verification 1 deliver 1] \
    prj_path      {/home/wongw/nx9000} \
]

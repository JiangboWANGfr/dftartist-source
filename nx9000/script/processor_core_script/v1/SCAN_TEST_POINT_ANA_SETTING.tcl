#----------------------------------------------
set number_processors 16
add_processors localhost:$number_processors
set timeA [clock seconds]
analyze_test_points
set timeB [clock seconds]
set duration [expr $timeB - $timeA]
puts "Duration of TPI with $number_processors processors is $duration seconds"
write_test_point_dofile  ./report/test_point/processor_core_tpi.dofile -all -replace       


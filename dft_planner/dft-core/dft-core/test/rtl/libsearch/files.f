// Only the top is listed. cell_and2 / cell_inv / mem_1k come from the search path.
top.sv
// an explicitly named library file: used where instantiated, never a top
-v vlib/cell_lib.v
-y cells
// argument on the following line (a filelist is a token stream, not a line format)
-y
mem
+libext+.vlib
// a stale path must be reported, not fatal
-y no_such_dir

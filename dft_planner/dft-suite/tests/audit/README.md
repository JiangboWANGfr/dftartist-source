# Value-display consistency audit (仿真显示一致性审计)

Rebuilds every clock/reset path with the frontend's OWN graph builders (buildCrSchematic +
withPlannedMuxes) over a REAL design's REAL analysis, then machine-checks every painted value:

- I1  DFF stateLabel == daemon per-phase answer (s/sac/asc)
- I2  planned-mux d1/S chip == daemon-computed state of the recorded source/select pin
- I4  value continuity: along a wire the value changes only across a NOT (flip), a planned
      mux (recomputed), or into a flop (stored value); Z lives only at ports
- I5  the mux functional arm carries no inherited post-fix value

Run:
1. dump data:  hdl serve <design.vc>  with  dp-shell(plan replay) + clock-reset-tree(phases)
   + report_dft_ctrl_mux/report_dft_ips  ->  /tmp/audit_data.json   (see git history probe)
2. node_modules/.bin/rolldown tests/audit/value_audit.ts --platform node --external node:fs -o /tmp/audit.mjs
3. node /tmp/audit.mjs        # exit 0 = zero violations

Last run 2026-08-15 on processor_core + user plan: 267 paths, 2123 value edges, 0 violations.

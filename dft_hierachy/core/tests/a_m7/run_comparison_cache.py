"""Run the unchanged B oracle with a fresh, retained wx report per invocation."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile

oracle, reports = sys.argv[1:]
directory = Path(tempfile.mkdtemp(prefix="comparison-cache-", dir=reports))
report = directory / "report.json"
print(f"B comparison cache report: {report}", flush=True)
result = subprocess.run([sys.executable, oracle],
                        env=dict(os.environ, HIER_B_COMPARISON_REPORT=str(report)))
sys.exit(result.returncode if result.returncode >= 0 else 1)

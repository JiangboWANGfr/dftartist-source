"""Invoke the original B52 oracle unchanged, with a fresh retained output directory."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile

binary, product, index = sys.argv[1:]
output = Path(tempfile.mkdtemp(prefix='hier-b52-author-run-')) / 'result'
oracle = Path(__file__).parent / 'independent-source-changes/run.py'
argv = [sys.executable, str(oracle), '--binary', binary, '--product', product, '--out', str(output)]
result = subprocess.run(argv)
Path(index).write_text(json.dumps(dict(argv=argv, output=str(output), exit=result.returncode), indent=2) + '\n')
print('Original B52 evidence:', output)
raise SystemExit(result.returncode)

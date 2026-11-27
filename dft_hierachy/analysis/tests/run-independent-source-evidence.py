"""Run B55's unchanged final oracle and retain original command/output files."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile

binary, product, index, *options = sys.argv[1:]
script = 'newlines.py' if options == ['--newlines'] else 'run.py'
assert not options or options == ['--newlines']
output = Path(tempfile.mkdtemp(prefix='hier-b55-author-run-')) / 'result'
argv = [sys.executable, str(Path(__file__).parent / 'independent-source-evidence' / script),
        '--binary', binary, '--product', product, '--out', str(output)]
result = subprocess.run(argv)
Path(index).write_text(json.dumps(dict(argv=argv, output=str(output), exit=result.returncode), indent=2)+'\n')
raise SystemExit(result.returncode)

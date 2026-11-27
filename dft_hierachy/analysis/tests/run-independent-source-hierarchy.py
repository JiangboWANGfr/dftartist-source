"""Run the unchanged B53 normal or empty-prefix public oracle and retain its output."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
binary,product,index,*mode=sys.argv[1:]
assert mode in [[],['--empty']]
output=Path(tempfile.mkdtemp(prefix='hier-b53-author-run-'))/'result'
oracle=Path(__file__).parent/'independent-source-hierarchy'/('empty-prefix.py' if mode else 'run.py')
argv=[sys.executable,str(oracle),'--binary',binary,'--product',product,'--out',str(output)]
result=subprocess.run(argv)
Path(index).write_text(json.dumps(dict(argv=argv,output=str(output),exit=result.returncode),indent=2)+'\n')
print('Original B53 evidence:',output)
raise SystemExit(result.returncode)

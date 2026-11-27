"""Run unchanged B54 ec0cbaec and retain every original output."""
from pathlib import Path
import sys,json,subprocess,tempfile
binary,product,index=sys.argv[1:];output=Path(tempfile.mkdtemp(prefix='hier-b54-author-run-'))/'result'
argv=[sys.executable,str(Path(__file__).parent/'independent-source-ranges/run.py'),'--binary',binary,'--product',product,'--out',str(output)]
r=subprocess.run(argv);Path(index).write_text(json.dumps(dict(argv=argv,output=str(output),exit=r.returncode),indent=2)+'\n');raise SystemExit(r.returncode)

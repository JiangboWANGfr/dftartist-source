"""C-44: repeated shared bodies must not materialize an AST per occurrence.

Measures each fresh process with wait4, in bytes on both macOS and Linux.
The growth gate catches the reported regression; it is not an M7 resource budget.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

generator = Path(__file__).parents[1] / 'fixtures' / 'synthetic' / 'gen.py'
binary = os.environ['HIER_BIN']
measurements = []
with tempfile.TemporaryDirectory(prefix='hier-open-scaling-') as directory:
    for depth in (3, 4, 5):
        source = Path(directory) / f'd{depth}.sv'
        with source.open('w') as out:
            subprocess.run([sys.executable, str(generator), '--fanout', '10', '--depth', str(depth),
                            '--unique', '0'], stdout=out, check=True)
        samples = []
        for _ in range(3):
            with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
                start = time.perf_counter()
                child = subprocess.Popen([binary, 'info', '--top', 'top', str(source)], stdout=out, stderr=err)
                _, status, usage = os.wait4(child.pid, 0)
                child.returncode = os.waitstatus_to_exitcode(status)
                elapsed = time.perf_counter() - start
                out.seek(0)
                err.seek(0)
                assert child.returncode == 0, err.read().decode()
                info = json.load(out)
                assert info['bodyCount'] == depth + 2, info
                assert info['bodySharing'] == 'fast', info
                rss = usage.ru_maxrss * (1 if sys.platform == 'darwin' else 1024)
                samples.append({'rssBytes': rss, 'seconds': elapsed})
        record = {'depth': depth, 'instances': 1 + sum(10 ** n for n in range(depth + 1)),
                  'bodyCount': depth + 2, 'samples': samples}
        measurements.append(record)
        print(json.dumps(record), flush=True)
small = min(s['rssBytes'] for s in measurements[0]['samples'])
large = min(s['rssBytes'] for s in measurements[-1]['samples'])
assert large <= small * 4 + 16 * 1024 * 1024, (small, large)
print('shared opening growth gate passed')

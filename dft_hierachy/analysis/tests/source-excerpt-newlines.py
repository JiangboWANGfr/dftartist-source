"""C-S2-10-01: physical lines from an independent delimiter table, through the real CLI."""
import bisect
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

binary, core_schema = sys.argv[1:]
root = Path(__file__).resolve().parents[1]
resources = []
for path in [Path(core_schema), *sorted((root / 'sequential').glob('*schema.json'))]:
    schema = json.loads(path.read_text())
    resources.append((schema['$id'], Resource.from_contents(schema)))
validator = Draft202012Validator(
    json.loads((root / 'sequential/source-evidence-excerpts-report.schema.json').read_text()),
    registry=Registry().with_resources(resources))
flags = '''--register-statistics --register-event-groups --register-control-profile
--register-resolved-events --logic --compare-register-scenarios --compare-register-generation
--compare-register-sources --source-coverage-deltas --source-bit-attribution
--source-transition-cohorts --source-impact-summary --source-hierarchy-summary
--source-hierarchy-matrix --source-hierarchy-ranges --select-source-ranges
--explain-source-ranges --locate-source-evidence --source-evidence-excerpts'''.split()
lines = [
    b'module newline_top(input clk, input [2:0] d, output reg [2:0] q, r, s);',
    '// 原字节 / Unicode 😀'.encode(), b'',
    b'  always @(posedge clk) begin', b'    q<=d; r<=d;', b'  end', b'',
    b'  always @(posedge clk) s<=d; endmodule',
]
calls = 0


def verify(report, raw):
    validator.validate(report)
    # This table is computed from the original bytes, not Core line numbers.
    starts = [0, *[m.end() for m in re.finditer(rb'\r\n|\r|\n', raw)]]
    if starts[-1] != len(raw):
        starts.append(len(raw))
    snippets, keys, rows, windows = [], [], [], set()
    work = 0
    for i, row in enumerate(report['rows']):
        span = report['analysis']['locations'][i]['span']
        first = bisect.bisect_right(starts, span['start']['offset']) - 1
        last = bisect.bisect_right(starts, span['end']['offset'] - 1) - 1
        n = report['limits']['contextLines']
        lo, hi = max(0, first-n), min(len(starts)-1, last+1+n)
        begin, end = starts[lo], starts[hi]
        key = (begin, end)
        original = (span['start']['offset'], span['end']['offset'])
        work += 3  # location, file and original-window lookups
        if original not in windows:
            work += span['start']['offset']-begin + end-span['end']['offset']
            windows.add(original)
        if key not in keys:
            keys.append(key)
            snippets.append(dict(file=0, startOffset=begin, endOffset=end,
                                 startLine=lo+1, text=raw[begin:end].decode()))
            work += end-begin
        rows.append(dict(location=i, state='available', file=0, snippet=keys.index(key)))
    assert report['rows'] == rows and report['snippets'] == snippets
    assert report['bytes'] == sum(len(s['text'].encode()) for s in snippets)
    assert len(report['files']) == bool(rows)
    assert report['cachedBytes'] == (len(raw) if rows else 0)
    if report['quality']['completeness'] == 'complete':
        assert len(rows) == len(report['analysis']['locations'])
        assert report['queries'] == 2 and report['readBytes'] == len(raw)
        assert report['work'] == work
    else:
        assert report['work'] >= work  # actual failed admission can consume work
    return report


def run(path, raw, context, extra=(), code=0):
    global calls
    argv = [binary, '--top', 'newline_top', '--scope', 'newline_top', str(path),
            *flags, '--scenario', 'BASE', '--scenario', 'REPEAT',
            '--source-excerpt-context-lines', str(context), '--require-complete', *extra]
    result = subprocess.run(argv, capture_output=True, timeout=30)
    calls += 1
    assert result.returncode == code, (argv, result.returncode, result.stdout, result.stderr)
    return verify(json.loads(result.stdout), raw)


with tempfile.TemporaryDirectory(prefix='hier-author-physical-lines-') as directory:
    path = Path(directory) / 'newlines.sv'
    for name, separators in [('lf', [b'\n']), ('cr', [b'\r']), ('crlf', [b'\r\n']),
                             ('mixed', [b'\r', b'\n', b'\r\n'])]:
        for trailing in [False, True]:
            raw = b''.join(line + (separators[i % len(separators)]
                          if i+1 < len(lines) or trailing else b'')
                          for i, line in enumerate(lines))
            path.write_bytes(raw)
            for context in [0, 1, 2, 20]:
                report = run(path, raw, context)
                assert report['rows'] and len(report['snippets']) < len(report['rows'])
                if context == 20:
                    assert len(report['snippets']) == 1 and report['bytes'] == len(raw)
            # Every budget uses real full-chain output, not a constructed producer.
            base = run(path, raw, 1)
            exact = ['--max-source-excerpt-work', str(base['work']),
                     '--max-source-excerpt-bytes', str(base['bytes']),
                     '--max-source-excerpt-cached-bytes', str(len(raw)),
                     '--max-source-excerpt-queries', '2']
            run(path, raw, 1, exact)
            prefix = run(path, raw, 1, ['--max-source-excerpt-locations', '1'], 4)
            assert len(prefix['rows']) == len(prefix['snippets']) == 1
            for key, value in [('work', base['work']-1), ('bytes', base['bytes']-1),
                               ('snippet-bytes', 1), ('cached-bytes', len(raw)-1)]:
                cut = run(path, raw, 1, ['--max-source-excerpt-'+key, str(value)], 4)
                assert len(cut['rows']) < len(base['rows'])
            print(name, 'trailing='+str(trailing), 'physical windows/context/shared/budgets passed')
print(f'{calls} physical newline CLI calls passed')

#!/usr/bin/env python3
"""Agent A reproducible runtime fallback probes. Run alone, with no concurrent builds.

Temporarily changes only Connections.cpp, builds, and checks both runtime answers and
verify-facts. Restores the original bytes and rebuilds in finally. Never edits B tests.
Usage: python3 core/tests/a_m2/mutation.py [build-directory]
"""
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
build = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'build'
source = root / 'frontend/src/Connections.cpp'
original = source.read_text()
marker = '        Accesses access(*this);'
assert original.count(marker) == 1
binary = build / 'hier'
fixtures = root / 'tests/fixtures'

def rebuild():
    # Make can compare mtimes at whole-second resolution. A quick restore in the
    # same second as the mutant build must not leave its object file in place.
    object_dir = build / 'CMakeFiles/hier_frontend.dir/frontend/src'
    for suffix in ('.o', '.obj'):
        (object_dir / ('Connections.cpp' + suffix)).unlink(missing_ok=True)
    p = subprocess.run(['cmake', '--build', str(build), '--target', 'hier', '-j', '6'],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if p.returncode:
        raise AssertionError(p.stdout)

def run(fixture, top, *args, ok=True):
    p = subprocess.run([str(binary), *args, '--top', top, str(fixtures / fixture)],
                       capture_output=True, text=True, timeout=30)
    if ok:
        assert p.returncode == 0, p.stdout + p.stderr
        return json.loads(p.stdout)
    assert p.returncode != 0, p.stdout
    assert 'mismatched=1' in p.stdout, p.stdout
    return p.stdout.splitlines()[0]

cases = [
    ('missing-read', 'precision/ops.sv', 'op_bitwise_and',
     'if (!proc.writes.empty()) proc.writes.front().deps.clear();', {'y': (0, 4)}, {'a', 'b'}),
    ('missing-write', 'm2/ports_edge.sv', 'process_at',
     'if (!proc.writes.empty()) proc.writes.erase(proc.writes.begin());',
     {'y': (0, 1), 'z': (0, 1)}, {'a', 'b'}),
    ('self-check-quarantine', 'm2/only_self_checked.sv', 'only_init',
     'proc.writes.clear();', {}, set()),
    ('streaming-missing-read', 'm3/expr_safety.sv', 'stream_right',
     'if (!proc.writes.empty()) proc.writes.front().deps.clear();', {'y': (0, 8)}, {'a'}),
]
try:
    for name, fixture, top, mutation, expected_targets, expected_reads in cases:
        source.write_text(original.replace(marker, '        ' + mutation + '\n' + marker))
        rebuild()
        counter = run(fixture, top, 'verify-facts', ok=False)
        names = {s['ref']: s['name'] for s in run(fixture, top, 'signals', 'i:0')['items']}
        p = run(fixture, top, 'proc', 'x:0:0')
        targets = {names[w['target']['ref']]: (w['target']['bits']['lsb'], w['target']['bits']['width'])
                   for w in p['result']['writes']}
        assert targets == expected_targets, (name, targets)
        for write in p['result']['writes']:
            assert {names[d['signal']] for d in write['deps']} == expected_reads
            assert all(d['align'] == 'all' and d['precision'] == 'conservative'
                       for d in write['deps'])
        if name == 'self-check-quarantine':
            assert p['completeness']['status'] == 'partial'
            initialized = next(ref for ref, n in names.items() if n == 'initialized')
            for method in ('drivers', 'loads'):
                answer = run(fixture, top, method, initialized, '--reach', 'local')
                assert answer['completeness']['status'] == 'partial', answer
                assert 'unsupported' in [r['code'] for r in answer['completeness']['reasons']]
        print(f'{name}: {counter}; runtime fallback checked', flush=True)
finally:
    source.write_text(original)
    rebuild()
    for _, fixture, top, _, _, _ in cases:
        p = subprocess.run([str(binary), 'verify-facts', '--top', top, str(fixtures / fixture)],
                           capture_output=True, text=True, timeout=30)
        assert p.returncode == 0 and 'mismatched=0' in p.stdout, p.stdout + p.stderr
print('original source and executable restored', flush=True)

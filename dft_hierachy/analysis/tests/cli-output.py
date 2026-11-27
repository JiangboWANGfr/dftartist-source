"""Four real native consumers export the same reports without overwriting prior results."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import tempfile
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

binary = Path(sys.argv[1]).resolve()
source = Path(sys.argv[2]).resolve()
e = Path(tempfile.mkdtemp(prefix='cli-output-cli-'))
calls = []
checks = 0
suffix = '.exe' if sys.platform == 'win32' else ''
schemas = [json.loads(p.read_text()) for folder in ['sequential', 'objects', 'memory', 'wrapper'] for p in (source / folder).rglob('*.schema.json') if 'packaging' not in p.parts]
schemas.append(json.loads((source.parent / 'protocol/schema/hier.schema.json').read_text()))
registry = Registry().with_resources((s['$id'], Resource.from_contents(s)) for s in schemas)
validators = {s['$id']: Draft202012Validator(s, registry=registry) for s in schemas}


def need(value, message):
    global checks
    checks += 1
    if not value:
        raise AssertionError(message)


def run(tool, args, code=0):
    argv = [str(binary / (tool + suffix)), *map(str, args)]
    result = subprocess.run(argv, cwd=e, capture_output=True, timeout=60)
    n = len(calls)
    (e / f'{n}.stdout').write_bytes(result.stdout)
    (e / f'{n}.stderr').write_bytes(result.stderr)
    calls.append(dict(argv=argv, cwd=str(e), exit=result.returncode, expectedExit=code))
    (e / 'commands.json').write_text(json.dumps(calls, indent=2))
    need(result.returncode == code, f'{argv}: {result.returncode} != {code}: {result.stdout[-1000:]!r} {result.stderr!r}')
    return result


def norm(value):
    if isinstance(value, dict):
        return {k: norm(v) for k, v in value.items() if k not in ['snapshotId', 'openedAt']}
    if isinstance(value, list):
        return list(map(norm, value))
    return value


try:
    examples = source / 'packaging/examples'
    wrapper_examples = source / 'wrapper/packaging/examples'
    seq = ['--top', 'sequential_example', '--scope', 'sequential_example', '--recursive', examples / 'sequential.sv', '--require-complete']
    mem = ['--top', 'memory_example', '--scope', 'memory_example', '--recursive', examples / 'memory.sv', '--memory-library', examples / 'memory-library.json', '--plan-tests', '--schedule-tests', '--time-tests', '--test-config', examples / 'memory-test.json', '--require-complete']
    wrapper = ['--top', 'wrapper_example', wrapper_examples / 'example.sv', '--config', wrapper_examples / 'chains.json', '--explain-chains', '--require-complete']
    cases = [
        ('dft-seqcheck', seq, 0, 'sequential:1'),
        ('dft-objects', [*seq, '--kind', 'port', '--text', '.q'], 0, 'object-catalog:1'),
        ('dft-memory', mem, 0, 'memory-test-timing:1'),
        ('dft-wrapper', wrapper, 0, 'wrapper-chain-explanation:1'),
        ('dft-seqcheck', [*seq, '--max-facts', '1'], 4, 'sequential:1'),
        ('dft-objects', [*seq, '--max-objects', '1'], 4, 'object-catalog:1'),
        ('dft-memory', [*mem, '--max-objects', '1'], 4, 'memory-test-timing:1'),
        ('dft-wrapper', [*wrapper, '--max-explain-work', '1'], 4, 'wrapper-chain-explanation:1'),
        ('dft-seqcheck', ['--top', 'constant_control', '--scope', 'constant_control', '--recursive', source / 'tests/design.sv', '--fail-on-error'], 1, 'sequential:1'),
        ('dft-objects', [*seq, '--text', '--output'], 0, 'object-catalog:1'),
    ]
    for n, (tool, args, code, uri) in enumerate(cases):
        console = json.loads(run(tool, args, code).stdout)
        out = e / f'report {n} 中文.json'
        exported = run(tool, ['--output', out, '--', *args], code)
        need(exported.stdout == b'', 'export does not duplicate report on console')
        value = json.loads(out.read_bytes())
        validators['urn:dft-studio:analysis:' + uri].validate(value)
        need(norm(value) == norm(console), 'whole report, exit and original fields retained')
    text_args = [*wrapper, '--format', 'text']
    console = run('dft-wrapper', text_args).stdout.decode()
    out = e / 'diagnosis 中文.txt'
    need(run('dft-wrapper', ['--output', out, '--', *text_args]).stdout == b'', 'text exported only once')
    normalize_text = lambda s: re.sub(r'^Snapshot:.*$', 'Snapshot: <identity>', s, flags=re.MULTILINE)
    need(normalize_text(console) == normalize_text(out.read_text()), 'original readable text byte content apart from snapshot identity')
    for tool, base, _, uri in cases[:4]:
        broken = e / ('broken-' + tool + '.sv')
        top = str(base[base.index('--top') + 1])
        broken.write_text('module ' + top + '(input a; endmodule\n')
        replace_input = lambda path: [(path if str(arg).endswith('.sv') else arg) for arg in base]
        for args, code in [(['--not-real'], 2), (replace_input('/missing-dft-export-input.sv'), 2), (replace_input(broken), 3)]:
            console = run(tool, args, code).stdout
            out = e / ('rejected-' + str(len(calls)) + '.json')
            rejected = run(tool, ['--output', out, '--', *args], code)
            need(rejected.stdout == console and not out.exists(), 'backend error remains console-only')
            validators['urn:dft-studio:analysis:' + uri].validate(json.loads(rejected.stdout))
        protected = e / ('protected-' + tool)
        protected.write_bytes(b'prior report')
        stamp = protected.stat().st_mtime_ns
        rejected = run(tool, ['--output', protected, '--', *base], 5)
        need(json.loads(rejected.stdout)['error']['code'] == 'output_failed', 'stable output failure')
        need(protected.read_bytes() == b'prior report' and protected.stat().st_mtime_ns == stamp, 'old file bytes/mtime untouched')
        for args in [['--output'], ['--output', '', '--', *base], ['--output', 'report.json', *base], ['--output', 'version.json', '--', '--version'], ['--output', 'help.txt', '--', '--help']]:
            rejected = run(tool, args, 2)
            need(json.loads(rejected.stdout)['error']['code'] == 'invalid_arguments', 'prefix has strict syntax')
        need(b'Export: --output FILE -- ORIGINAL_ARGS' in run(tool, ['--help']).stdout, 'discoverable native option')
    private_input = e / 'input.sv'
    shutil.copyfile(examples / 'sequential.sv', private_input)
    saved = private_input.read_bytes()
    run('dft-seqcheck', ['--output', private_input, '--', *seq], 5)
    need(private_input.read_bytes() == saved, 'input cannot be truncated')
    linked = e / 'output-link'
    linked.symlink_to(e / 'absent-link-target')
    run('dft-wrapper', ['--output', linked, '--', *wrapper], 5)
    need(linked.is_symlink() and not (e / 'absent-link-target').exists(), 'dangling output symlink preserved')
    need(not list(e.glob('.dft-report-*')), 'all staging resources removed')
    need(not (e / 'version.json').exists() and not (e / 'help.txt').exists() and not (e / 'report.json').exists(), 'invalid prefixes publish nothing')
    print(json.dumps(dict(calls=len(calls), checks=checks, reportPairs=len(cases) + 1, output=str(e))))
except BaseException:
    print('output:', e)
    raise

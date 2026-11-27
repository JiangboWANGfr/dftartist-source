"""Real four-tool component, offline examples, legacy co-install and archive boundaries."""
from pathlib import Path
import copy
import hashlib
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

build = Path(sys.argv[1]).resolve()
config = sys.argv[2]
binaries = Path(sys.argv[3]).resolve()
source = Path(sys.argv[4]).resolve()
e = Path(tempfile.mkdtemp(prefix='analysis-install-cli-'))
calls = []
checks = 0
suffix = '.exe' if os.name == 'nt' else ''
tools = ['dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper']


def need(value, message):
    global checks
    checks += 1
    if not value:
        raise AssertionError(message)


def run(argv, code=0, env=None):
    result = subprocess.run(list(map(str, argv)), cwd=e, env=env, capture_output=True, timeout=90)
    n = len(calls)
    (e / f'{n}.stdout').write_bytes(result.stdout)
    (e / f'{n}.stderr').write_bytes(result.stderr)
    calls.append(dict(argv=list(map(str, argv)), cwd=str(e), exit=result.returncode, expectedExit=code))
    (e / 'commands.json').write_text(json.dumps(calls, indent=2))
    need(result.returncode == code, f'{argv}: {result.returncode} != {code}: {result.stderr!r} {result.stdout[-1200:]!r}')
    return result


def norm(value):
    if isinstance(value, dict):
        return {k: norm(v) for k, v in value.items() if k not in ['snapshotId', 'openedAt']}
    if isinstance(value, list):
        return list(map(norm, value))
    return value


try:
    initial = e / '安装 prefix'
    run(['cmake', '--install', build, '--config', config, '--prefix', initial, '--component', 'AnalysisCLI'])
    moved = e / 'moved analysis 空格'
    initial.rename(moved)
    data = moved / 'share/dft-analysis'
    manifest = data / 'manifest.json'
    original = manifest.read_bytes()
    doc = json.loads(original)
    Draft202012Validator(json.loads((data / 'manifest.schema.json').read_text())).validate(doc)
    need(doc['format'] == 'analysis-cli-manifest-v1' and doc['kind'] == 'dft-analysis-install', 'suite identity')
    need(len(doc['files']) == 82, 'complete suite payload')
    need([r['path'] for r in doc['files']] == sorted(r['path'] for r in doc['files']), 'sorted manifest')
    need({Path(r['path']).name for r in doc['files'] if r['kind'] == 'executable'} == {t + suffix for t in tools}, 'four native tools')
    run([sys.executable, data / 'verify.py', '--prefix', moved])
    for tool in tools:
        for arg in ['--version', '--help']:
            need(run([moved / 'bin' / (tool + suffix), arg]).stdout == run([binaries / (tool + suffix), arg]).stdout, 'version/help unchanged')

    schemas = [json.loads(p.read_text()) for p in (data / 'schemas').rglob('*.schema.json')]
    ids = {s['$id'] for s in schemas}
    need(len(schemas) == len(ids) == 66, 'all report/input schemas with unique original URI')
    registry = Registry().with_resources((s['$id'], Resource.from_contents(s)) for s in schemas)

    def refs(value):
        if isinstance(value, dict):
            if '$ref' in value:
                yield value['$ref']
            for child in value.values():
                yield from refs(child)
        elif isinstance(value, list):
            for child in value:
                yield from refs(child)

    for schema in schemas:
        Draft202012Validator.check_schema(schema)
        for ref in refs(schema):
            need(ref.startswith('#') or ref.split('#')[0] in ids, 'offline reference closure')
    validators = {s['$id']: Draft202012Validator(s, registry=registry) for s in schemas}
    examples = data / 'examples'
    validators['urn:dft-studio:analysis:memory-library-input:1'].validate(json.loads((examples / 'memory-library.json').read_text()))
    validators['urn:dft-studio:analysis:memory-test-config-input:1'].validate(json.loads((examples / 'memory-test.json').read_text()))
    seq = ['--top', 'sequential_example', '--scope', 'sequential_example', '--recursive', examples / 'sequential.sv', '--require-complete']
    mem = ['--top', 'memory_example', '--scope', 'memory_example', '--recursive', examples / 'memory.sv', '--memory-library', examples / 'memory-library.json', '--plan-tests', '--schedule-tests', '--time-tests', '--test-config', examples / 'memory-test.json', '--require-complete']
    wrapper = ['--top', 'wrapper_example', examples / 'example.sv', '--explain-chains', '--require-complete']
    cases = [
        ('dft-seqcheck', [*seq, '--fail-on-error'], 'sequential:1'),
        ('dft-objects', [*seq, '--kind', 'port', '--text', '.q'], 'object-catalog:1'),
        ('dft-memory', mem, 'memory-test-timing:1'),
        ('dft-wrapper', [*wrapper, '--config', examples / 'chains.json'], 'wrapper-chain-explanation:1'),
        ('dft-wrapper', [*wrapper, '--config', examples / 'excluded.json'], 'wrapper-chain-explanation:1'),
    ]
    reports = []
    for tool, args, uri in cases:
        report = json.loads(run([moved / 'bin' / (tool + suffix), *args]).stdout)
        validators['urn:dft-studio:analysis:' + uri].validate(report)
        built = json.loads(run([binaries / (tool + suffix), *args]).stdout)
        need(norm(built) == norm(report), 'whole installed report equals built tool')
        reports.append(report)
    need(len(reports[0]['registers']) == 2 and reports[0]['findings'] == [], 'two declared sequential facts')
    need(len(reports[1]['objects']) == 2 and all(x['kind'] == 'port' for x in reports[1]['objects']), 'two q ports')
    need(reports[2]['timeline']['timedInstances'] == 2 and reports[2]['timeline']['durationPicoseconds'] == 16000, 'two explicit memory models, 16 operations at 1000ps')
    need(reports[3]['explanation']['counts']['conflict'] == 1 and reports[4]['explanation']['counts']['compatible'] == 1, 'constraint edit and recheck')
    for file in ['chains.json', 'excluded.json']:
        text = run([moved / 'bin' / ('dft-wrapper' + suffix), *wrapper, '--config', examples / file, '--format', 'text']).stdout
        need(b'Wrapper chain diagnostics' in text and b'(declaration)' in text, 'installed readable location')

    # Both components share the same built native bytes and own separate data/manifest trees.
    run(['cmake', '--install', build, '--config', config, '--prefix', moved, '--component', 'WrapperCLI'])
    run([sys.executable, moved / 'share/dft-wrapper/verify.py', '--prefix', moved])
    run([sys.executable, data / 'verify.py', '--prefix', moved])
    need(manifest.read_bytes() == original, 'co-install does not rewrite suite manifest')
    run(['cmake', '--install', build, '--config', config, '--prefix', moved, '--component', 'AnalysisCLI'])
    need(manifest.read_bytes() == original, 'repeatable suite manifest')
    stage = e / 'destdir'
    env = dict(os.environ, DESTDIR=str(stage))
    run(['cmake', '--install', build, '--config', config, '--prefix', '/suite-stage', '--component', 'AnalysisCLI'], env=env)
    run([sys.executable, stage / 'suite-stage/share/dft-analysis/verify.py', '--prefix', stage / 'suite-stage'])
    need((stage / 'suite-stage/share/dft-analysis/manifest.json').read_bytes() == original, 'DESTDIR no prefix metadata')

    # New format and the exact executable set must agree; old v1 remains separate.
    variants = []
    for key, value in [('format', 'wrapper-cli-manifest-v1'), ('kind', 'dft-wrapper-install'), ('formatVersion', True), ('formatVersion', 2), ('extra', 0)]:
        variant = copy.deepcopy(doc)
        variant[key] = value
        variants.append(variant)
    variant = copy.deepcopy(doc)
    next(row for row in variant['files'] if row['kind'] == 'executable')['kind'] = 'data'
    variants.append(variant)
    for variant in variants:
        manifest.write_text(json.dumps(variant))
        rejected = run([sys.executable, data / 'verify.py', '--prefix', moved], 1)
        need(json.loads(rejected.stderr)['ok'] is False, 'strict suite format error')
    manifest.write_bytes(original)
    native = moved / 'bin' / ('dft-memory' + suffix)
    renamed = native.with_name('dft-unknown' + suffix)
    native.rename(renamed)
    variant = copy.deepcopy(doc)
    next(row for row in variant['files'] if row['path'] == 'bin/dft-memory' + suffix)['path'] = 'bin/dft-unknown' + suffix
    manifest.write_text(json.dumps(variant))
    rejected = run([sys.executable, data / 'verify.py', '--prefix', moved], 1)
    need('four native' in json.loads(rejected.stderr)['error'], 'native identity rather than just count')
    renamed.rename(native)
    manifest.write_bytes(original)
    native.rename(renamed)
    run([sys.executable, data / 'verify.py', '--prefix', moved], 1)
    renamed.rename(native)
    run([sys.executable, data / 'verify.py', '--prefix', moved])

    archive = e / 'analysis suite.tar.gz'
    args = [sys.executable, data / 'bundle.py', '--build', build, '--config', config, '--component', 'AnalysisCLI', '--output', archive]
    if doc['sanitized']:
        run(args, 1)
        need(not archive.exists(), 'sanitizer suite is not released')
    else:
        run(args)
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        run(args, 1)
        need(hashlib.sha256(archive.read_bytes()).hexdigest() == digest, 'no archive overwrite')
        extracted = e / 'extracted'
        extracted.mkdir()
        with tarfile.open(archive) as tar:
            need(set(tar.getnames()) == {r['path'] for r in doc['files']} | {'share/dft-analysis/manifest.json'}, 'exact suite archive')
            tar.extractall(extracted, filter='data')
        run([sys.executable, extracted / 'share/dft-analysis/verify.py', '--prefix', extracted])
        for tool in tools:
            run([extracted / 'bin' / (tool + suffix), '--version'])
    run([sys.executable, data / 'bundle.py', '--build', build, '--component', 'other', '--output', e / 'invalid.tar.gz'], 2)
    # Controlled installer returns a real, valid legacy component for the wrong request.
    fake = e / 'wrong-component-cmake'
    marker = e / 'stage-path.txt'
    fake.write_text('#!' + sys.executable + '\nimport pathlib,shutil,sys\np=pathlib.Path(sys.argv[sys.argv.index("--prefix")+1]);p.mkdir(parents=True)\npathlib.Path(' + repr(str(marker)) + ').write_text(str(p))\ns=pathlib.Path(' + repr(str(moved)) + ')\nshutil.copytree(s/"share/dft-wrapper",p/"share/dft-wrapper")\n(p/"bin").mkdir()\nshutil.copy2(s/"bin"/' + repr('dft-wrapper' + suffix) + ',p/"bin"/' + repr('dft-wrapper' + suffix) + ')\n')
    fake.chmod(0o755)
    rejected = run([sys.executable, data / 'bundle.py', '--build', build, '--component', 'AnalysisCLI', '--cmake', fake, '--output', e / 'wrong.tar.gz'], 1)
    need('does not match' in json.loads(rejected.stderr)['error'], 'installer component confusion rejected')
    need(not Path(marker.read_text()).parent.exists(), 'temporary install cleaned on failure')
    need(not (e / 'wrong.tar.gz').exists() and not list(e.glob('.*.tar.gz-*.tmp')), 'no incomplete formal artifact')
    print(json.dumps(dict(calls=len(calls), checks=checks, files=len(doc['files']), schemas=len(schemas), reportPairs=len(cases), negativeManifests=len(variants) + 1, sanitized=doc['sanitized'], output=str(e))))
except BaseException:
    print('output:', e)
    raise

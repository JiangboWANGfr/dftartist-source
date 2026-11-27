"""Public CLI/schema regression with hand-counted RTL occurrence expectations."""
import copy
import json
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

BIN = sys.argv[1]
ROOT = Path(__file__).resolve().parent.parent
CORE = json.loads(Path(sys.argv[2]).read_text())
SCHEMA = json.loads((ROOT/'objects/object-catalog.schema.json').read_text())
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA, registry=Registry().with_resource(CORE['$id'], Resource.from_contents(CORE)))
OUT = Path(tempfile.mkdtemp(prefix='hier-object-catalog-cli-'))
FIXTURE = ROOT/'tests/object-catalog.sv'
BASE = ['--top', 'catalog_top', '--scope', 'catalog_top', '--recursive', str(FIXTURE)]
records = []

def invoke(args, code=0):
    command = [BIN, *args]
    result = subprocess.run(command, capture_output=True, timeout=40)
    n = len(records)
    (OUT/f'{n}.stdout').write_bytes(result.stdout)
    (OUT/f'{n}.stderr').write_bytes(result.stderr)
    records.append(dict(argv=[x.decode('utf-8', 'backslashreplace') if isinstance(x, bytes) else x for x in command],
                        exit=result.returncode, expectedExit=code))
    (OUT/'commands.json').write_text(json.dumps(records, indent=2))
    assert result.returncode == code, (command, result.returncode, result.stdout, result.stderr)
    value = json.loads(result.stdout.decode('utf-8'))
    VALIDATOR.validate(value)
    if 'objects' in value:
        assert len({o['object']['ref'] for o in value['objects']}) == len(value['objects'])
        for row in value['objects']:
            assert row['object']['inst'] == value['instances'][row['instance']]['info']['ref']
            assert row['object']['kind'] == row['kind']
            if row['kind'] != 'instance':
                assert row[row['kind']]['ref'] == row['object']['ref']
    return value

try:
    all_objects = invoke([*BASE, '--require-complete'])
    assert all_objects['complete'] and not all_objects['reasons']
    assert len(all_objects['instances']) == 8 and len(all_objects['objects']) == 60
    assert Counter(o['kind'] for o in all_objects['objects']) == dict(instance=8, port=16, signal=36)
    for size in ['1', '2', '2000']:
        paged = invoke([*BASE, '--page-size', size, '--require-complete'])
        assert paged['objects'] == all_objects['objects']
        assert paged['instances'] == all_objects['instances']
    exact = invoke([*BASE, '--max-instances', '8', '--max-objects', '60',
                    '--max-queries', str(all_objects['queries']), '--max-work', str(all_objects['work']), '--require-complete'])
    assert exact['objects'] == all_objects['objects']
    local = invoke([x for x in BASE if x != '--recursive'])
    assert len(local['instances']) == 1 and len(local['objects']) == 11
    for scope in ['catalog_top.g[1].u', 'catalog_top.pair[0]', 'catalog_top.\\odd.name ']:
        sub = invoke(['--top', 'catalog_top', '--scope', scope, '--recursive', str(FIXTURE), '--require-complete'])
        assert sub['scope']['pathText'] == scope and len(sub['objects']) == 7
        ports = [o['port'] for o in sub['objects'] if o['kind'] == 'port']
        assert [p['direction'] for p in ports] == ['in', 'out']
        assert all(p['width'] == (2 if 'g[1]' in scope else 4) for p in ports)
    for kind, count in [('instance', 8), ('port', 16), ('signal', 36)]:
        selected = invoke([*BASE, '--kind', kind])
        assert len(selected['objects']) == count and len(selected['instances']) == 8
    selected = invoke([*BASE, '--kind', 'port', '--text', 'left'])
    assert [o['object']['name'] for o in selected['objects']] == ['a', 'y']
    for text in ['*', 'LEFT', '不存在']:
        empty = invoke([*BASE, '--text', text, '--max-objects', '1', '--require-complete'])
        assert empty['complete'] and not empty['objects'] and len(empty['instances']) == 8
    escaped = invoke([*BASE, '--kind', 'signal', '--text', '\\escaped.sig '])
    assert len(escaped['objects']) == 1 and escaped['objects'][0]['object']['name'] == 'escaped.sig'
    for name, value in [('objects', '1'), ('instances', '1'), ('queries', '3'), ('work', '1')]:
        prefix = invoke([*BASE, '--max-'+name, value, '--require-complete'], 4)
        assert prefix['reasons'] == ['budget_'+name] and not prefix['complete']
        assert prefix['objects'] == all_objects['objects'][:len(prefix['objects'])]
        if name == 'queries': assert prefix['queries'] == 3
        if name == 'work': assert prefix['work'] == 1
    assert not invoke([*BASE, '--max-objects', '1'])['complete']
    opaque_base = ['--top', 'catalog_opaque', '--scope', 'catalog_opaque', '--recursive', str(FIXTURE)]
    opaque = invoke([*opaque_base, '--require-complete'], 4)
    assert 'opaque_instance' in opaque['reasons'] and not opaque['instances'][1]['objectsComplete']
    known = invoke([*opaque_base, '--kind', 'instance', '--kind', 'port', '--require-complete'])
    assert known['complete'] and len(known['objects']) == 6
    empty = invoke(['--top', 'catalog_empty', '--scope', 'catalog_empty', str(FIXTURE), '--require-complete'])
    assert len(empty['objects']) == 1 and empty['complete']
    for extra in [['--kind', 'pin'], ['--kind', 'port', '--kind', 'port'], ['--max-instances', '0'],
                  ['--max-objects', '1000001'], ['--max-queries', '2'], ['--max-work', '0'],
                  ['--max-millis', '60001'], ['--page-size', '2001'], ['--page-size', '-1'],
                  ['--max-queries', '1x'], ['--text', 'a'*4097], ['--recursive'], ['--scope', 'catalog_top'],
                  ['--unknown', 'value'], ['--kind'], ['--text', b'\xed\xa0\x80']]:
        assert invoke([*BASE, *extra], 2)['error']['code'] == 'invalid_arguments'
    invoke(['--top', 'catalog_top', str(FIXTURE)], 2)
    invoke(['--scope', 'catalog_top', str(FIXTURE)], 2)
    invoke(['--top', 'catalog_top', '--scope', 'missing', str(FIXTURE)], 3)
    invoke(['--top', 'catalog_top', '--scope', 'catalog_top.a', str(FIXTURE)], 2)
    invoke(['--top', 'catalog_top', '--scope', 'catalog_top', '/not/a/design.sv', '--max-work', '0'], 2)
    # Both file-list modes are actual Core inputs, including relative -F resolution.
    (OUT/'absolute.f').write_text(str(FIXTURE)+'\n')
    (OUT/'design.sv').write_bytes(FIXTURE.read_bytes())
    (OUT/'relative.f').write_text('design.sv\n')
    for option, name in [('-f', 'absolute.f'), ('-F', 'relative.f')]:
        result = invoke([*BASE[:-1], option, str(OUT/name), '-I', str(OUT), '-D', 'CATALOG_TEST=1', '--require-complete'])
        assert len(result['objects']) == 60 and result['complete']
    # New envelope is strict, including per-kind payload and owner facts.
    for mutation in range(4):
        bad = copy.deepcopy(all_objects)
        if mutation == 0: bad['unknown'] = True
        if mutation == 1: bad['objects'][0]['port'] = all_objects['objects'][1]['port']
        if mutation == 2: del bad['objects'][1]['port']
        if mutation == 3: bad['instances'][0]['unknown'] = True
        assert not VALIDATOR.is_valid(bad)
    print(json.dumps(dict(calls=len(records), schemaNegativeCases=4, output=str(OUT))))
except BaseException:
    print('Raw first-failure evidence:', OUT)
    raise

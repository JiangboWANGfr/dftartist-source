"""Declared partition clock periods through the real CLI and every report consumer."""
import copy
import json
import random
import subprocess
import sys
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(tempfile.mkdtemp(prefix="hier-memory-clock-partitions-cli-"))
WAVE = 16007  # 8 words * 2 operations * 1000ps, plus 7ps wave overhead.
commands = []
equivalences = negatives = references = 0
schemas = [json.loads(Path(sys.argv[2]).read_text())]
schemas += [json.loads(p.read_text()) for p in ROOT.rglob("*.schema.json")]
registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)
validators = {}
for schema in schemas:
    Draft202012Validator.check_schema(schema)
    algorithm = schema.get("oneOf", [{}])[0].get("properties", {}).get("algorithm")
    if algorithm:
        validators[algorithm["const"]] = Draft202012Validator(schema, registry=registry)


def file(name, value):
    path = OUT / name
    path.write_text(json.dumps(value, indent=2))
    return str(path)


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in ("snapshotId", "openedAt")}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


def same(left, right):
    global equivalences
    assert clean(left) == clean(right)
    equivalences += 1


def call(args, code=0):
    argv = [sys.argv[1], *args]
    result = subprocess.run(argv, capture_output=True, timeout=40)
    index = len(commands)
    (OUT / f"{index}.stdout").write_bytes(result.stdout)
    (OUT / f"{index}.stderr").write_bytes(result.stderr)
    commands.append(dict(argv=argv, exit=result.returncode, expectedExit=code))
    file("commands.json", commands)
    assert result.returncode == code, (index, result.stdout, result.stderr)
    document = json.loads(result.stdout)
    validators[document.get("algorithm", "rtl-memory-test-timing-v1")].validate(document)
    return document




base = ["--top", "schedule_top", "--scope", "schedule_top", "--recursive",
        str(ROOT / "tests/memory-test-schedule.sv"), "--memory-library",
        str(ROOT / "tests/memory-test-schedule-library.json"),
        "--plan-tests", "--schedule-tests", "--time-tests"]
assignments = [dict(instancePath="schedule_top." + name, clockDomain=name[0], partition="p" + name[1])
               for name in ["a0", "a1", "a2", "a3", "b0", "b1", "c0", "d0"]]
template = dict(formatVersion=1, kind="memory-test-config", assignments=assignments,
    planning=dict(policy=dict(maxMemoriesPerController=1)),
    scheduling=dict(policy=dict(maxParallelControllers=8, maxPowerMicrowatts=1000000)),
    timing=dict(clocks=[dict(clockDomain=d, periodPicoseconds=1000) for d in "abcd"],
                policy=dict(waveOverheadPicoseconds=7)))
expectations = file("expectations.json", dict(formatVersion=1, kind="memory-clock-expectations",
    domains=[dict(clockDomain=d, sources=[dict(path="schedule_top.clk", bit=0, edge="posedge")])
             for d in "abcd"]))


def invoke(label, config, complete=True, extra=()):
    return call([*base, "--test-config", file(label + ".json", config), *extra, "--require-complete"],
                0 if complete else 4)


def nodes(value, algorithm):
    if isinstance(value, dict):
        if value.get("algorithm") == algorithm:
            yield value
        for child in value.values():
            yield from nodes(child, algorithm)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child, algorithm)


def envelope_boundaries(document):
    global negatives
    for bad in [["p0", "p0"], [None], "p0", ["a\0b"], ["x" * 4097], list(map(str, range(1025)))]:
        changed = copy.deepcopy(document)
        timing = next(nodes(changed, "rtl-memory-test-timing-v1"))
        timing["timeline"]["request"]["clocks"][0]["partitions"] = bad
        assert not validators[document["algorithm"]].is_valid(changed), bad
        negatives += 1


def chain(label, config, duration, complete=True):
    # Every envelope must retain the exact authoritative source, including selectors.
    plain_config = copy.deepcopy(config)
    plain_config["timing"]["clocks"] = [c for c in plain_config["timing"]["clocks"] if not c.get("partitions")]
    plain = file(label + "-plain.json", plain_config)
    selected = file(label + ".json", config)
    args = [*base, "--test-config", selected]
    code = 0 if complete else 4
    timing = call([*args, "--require-complete"], code)
    assert timing["timeline"]["durationPicoseconds"] == duration
    coverage = call([*args, "--test-coverage", "--require-complete"], code)
    usage = call([*args, "--test-resource-usage", "--require-complete"], code)
    assessment = call([*args, "--assess-tests", expectations, "--require-complete"], code)
    same(coverage["source"], timing)
    same(usage["source"], timing)
    same(assessment["source"], coverage)
    compare = [*base, "--compare-test-config", "plain", plain, "--compare-test-config", "selected", selected]
    comparison = call([*compare, "--require-complete"], code)
    usage_comparison = call([*compare, "--compare-resource-usage", "--require-complete"], code)
    assessed = call([*compare, "--compare-clock-expectations", "plain", expectations,
                     "--compare-clock-expectations", "selected", expectations, "--require-complete"], code)
    same(comparison["configurations"][1]["report"], timing)
    same(usage_comparison["source"], comparison)
    same(assessed["source"], comparison)
    if complete:
        assert coverage["coverage"]["timedInstances"] == assessment["assessment"]["satisfiedInstances"] == 8
        for document in [timing, coverage, usage, assessment, comparison, usage_comparison, assessed]:
            envelope_boundaries(document)
    else:
        assert "delta" not in comparison["rows"][1] and "delta" not in assessed["rows"][1]
        assert "delta" not in usage_comparison["rows"][0]["cells"][1]
    return timing, usage


def clock(domain, period, partitions=None):
    result = dict(clockDomain=domain, periodPicoseconds=period)
    if partitions is not None:
        result['partitions'] = partitions
    return result


original = invoke('original', template)
assert original['timeline']['durationPicoseconds'] == 16007
selected = copy.deepcopy(template)
selected['timing']['clocks'].append(clock('a', 2000, ['p0']))
selected['scheduling']['resources'] = [dict(name='all', maxParallelControllers=8, clockDomains=list('abcd'))]
timing, usage = chain('selected', selected, 32007)
assert [e['clock'] for e in timing['timeline']['waves'][0]['entries']] == [4, 0, 0, 0, 1, 1, 2, 3]
assert usage['usage']['rows'][0]['occupiedPicoseconds'] == 32007
assert timing['timeline']['work'] == 8
same(timing['source'], invoke('same-schedule', dict(selected, timing=template['timing']))['source'])
reversed_config = copy.deepcopy(selected)
reversed_config['timing']['clocks'].reverse()
reverse = invoke('reverse', reversed_config)
assert reverse['timeline']['durationPicoseconds'] == 32007
assert reverse['timeline']['waves'][0]['entries'][0]['clock'] == 0
shadow = copy.deepcopy(selected)
shadow['timing']['clocks'][-1]['partitions'] = ['p0', 'p1', 'p2', 'p3']
assert invoke('shadow', shadow)['timeline']['unusedClocks'] == [0]
missing = copy.deepcopy(selected)
missing['timing']['clocks'] = missing['timing']['clocks'][1:]
miss, _ = chain('missing', missing, 0, False)
assert miss['timeline']['stop'] == dict(wave=0, entry=1, reason='clock_missing')
assert miss['timeline']['work'] == 2 and miss['timeline']['unusedClocks'] == [0, 1, 2, 3]
exact = copy.deepcopy(selected)
exact['timing']['clocks'][-1]['partitions'] = ['']
assert invoke('empty-unmatched', exact)['timeline']['durationPicoseconds'] == 16007
exact['assignments'][0]['partition'] = ''
assert invoke('empty-matched', exact)['timeline']['durationPicoseconds'] == 32007
exact['timing']['clocks'][-1]['partitions'] = ['p*']
assert invoke('literal-no-glob', exact)['timeline']['durationPicoseconds'] == 16007

mixed = copy.deepcopy(selected)
mixed['scheduling']['dependencies'] = [dict(before='a', after='b', beforePartitions=['p0'], afterPartitions=['p0'], minimumGapPicoseconds=20000)]
mixed['scheduling']['resources'][0].update(recoveryPicoseconds=5000, unavailableIntervals=[dict(startPicoseconds=52007, endPicoseconds=60000)])
mt, mu = chain('waits', mixed, 76007)
assert [mt['timeline'][k] for k in ['resourceWaitPicoseconds', 'dependencyWaitPicoseconds', 'availabilityWaitPicoseconds']] == [5000, 15000, 7993]
assert mu['usage']['rows'][0]['occupiedPicoseconds'] == 48014
mixed['timing']['policy']['maxDurationPicoseconds'] = 76006
partial, _ = chain('wait-prefix', mixed, 32007, False)
assert len(partial['timeline']['waves']) == 1
assert all(k not in partial['timeline'] for k in ['resourceWaitPicoseconds', 'dependencyWaitPicoseconds', 'availabilityWaitPicoseconds'])

manual = [*base, '--test-max-controller-memories', '1', '--schedule-max-parallel', '8', '--schedule-max-power', '1000000', '--time-wave-overhead', '7']
for a in assignments:
    manual += ['--test-instance', a['instancePath'], a['clockDomain'], a['partition']]
for d in 'abcd':
    manual += ['--test-clock', d, '1000']
manual += ['--test-partition-clock', 'a', 'p0', '2000']
no_resource = copy.deepcopy(selected)
no_resource['scheduling'].pop('resources')
same(call(manual), invoke('manual-equivalent', no_resource))
for args in [base + ['--test-partition-clock'], base + ['--test-partition-clock', 'a', 'p0'],
             ['--test-partition-clock', 'a', 'p0', '1'],
             base + ['--test-partition-clock', 'a', 'p0', '1', '--test-config', file('conflict.json', selected)],
             base + ['--test-partition-clock', 'a', 'p0', '1', '--compare-test-config', 'one', file('one.json', selected), '--compare-test-config', 'two', file('two.json', selected)],
             manual + ['--test-partition-clock', 'a', 'p0', '2000']]:
    call(args, 2)

invalid = []
for parts in [['p0','p0'], ['a\0b'], ['x'*4097], list(map(str,range(1025))), [None], 'p0']:
    q = copy.deepcopy(selected);q['timing']['clocks'][-1]['partitions'] = parts;invalid.append(q)
for declaration in [clock('a', 2000, ['p0']), clock('a', 1000), clock('a', 1000, [])]:
    q = copy.deepcopy(selected);q['timing']['clocks'].append(declaration);invalid.append(q)
q = copy.deepcopy(selected);q['timing']['clocks'][-1]['unknown'] = 1;invalid.append(q)
for period in [0, -1, 1.5, True, 1000000000001]:
    q = copy.deepcopy(selected);q['timing']['clocks'][-1]['periodPicoseconds'] = period;invalid.append(q)
q = copy.deepcopy(selected);q['timing']['clocks'] = [clock(str(i), 1, list(map(str,range(1024)))) for i in range(4)] + [clock('extra',1,['x'])];invalid.append(q)
for i,q in enumerate(invalid):
    call(['--top','missing','--scope','missing','/does/not/exist.sv','--plan-tests','--schedule-tests','--time-tests','--test-config',file(f'invalid-{i}.json',q)],2)

# A full-scan declaration oracle, independent of the indexed implementation.
# Each known fixture controller has one 16-cycle step; global cap alone groups it.
rng = random.Random(224)
for sample in range(48):
    q = copy.deepcopy(template)
    cap = rng.randint(1,8);q['scheduling']['policy']['maxParallelControllers'] = cap
    declarations = []
    for domain in 'abcd':
        if rng.randrange(4):declarations.append(clock(domain, rng.randint(1,6000)))
        chosen = rng.sample(['p0','p1','p2','p3',''], rng.randint(0,5))
        for part in chosen:declarations.append(clock(domain,rng.randint(1,6000),[part]))
    rng.shuffle(declarations);q['timing']['clocks'] = declarations
    expected, used, work, missing_entry = [], set(), 0, None
    for wi, start in enumerate(range(0,8,cap)):
        entries=[]
        for ei,a in enumerate(assignments[start:start+cap]):
            work += 1
            specifics=[i for i,c in enumerate(declarations) if c['clockDomain']==a['clockDomain'] and a['partition'] in c.get('partitions',[])]
            defaults=[i for i,c in enumerate(declarations) if c['clockDomain']==a['clockDomain'] and not c.get('partitions')]
            matches=specifics or defaults
            if not matches:missing_entry=(wi,ei);break
            ci=matches[0];entries.append(dict(clock=ci,durationPicoseconds=16*declarations[ci]['periodPicoseconds']))
        if missing_entry:break
        begin=expected[-1]['endPicoseconds'] if expected else 0
        duration=7+max(e['durationPicoseconds'] for e in entries)
        expected.append(dict(startPicoseconds=begin,endPicoseconds=begin+duration,durationPicoseconds=duration,entries=entries))
        used.update(e['clock'] for e in entries)
    result=invoke(f'random-{sample}',q,missing_entry is None)['timeline']
    assert result['waves']==expected and result['work']==work,(sample,result,expected)
    assert result['unusedClocks']==[i for i in range(len(declarations)) if i not in used]
    if missing_entry:assert result['stop']==dict(wave=missing_entry[0],entry=missing_entry[1],reason='clock_missing')
    references+=1

for limit in range(1,9):
    q=copy.deepcopy(selected);q['timing']['limits']=dict(maxWork=limit)
    report=invoke(f'work-{limit}',q,limit==8)['timeline']
    assert report['work']==limit and len(report['waves'])==(1 if limit==8 else 0)
    assert len(report['unusedClocks'])==(0 if limit==8 else 5)
normal=copy.deepcopy(template)
for c in normal['timing']['clocks']:c['partitions']=[]
same(invoke('explicit-empty',normal),original)
print(json.dumps(dict(calls=len(commands),references=references,equivalences=equivalences,schemaNegatives=negatives,output=str(OUT))))

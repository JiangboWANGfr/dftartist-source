"""Author RTL/source grouping and original-event accounting; no independent B claim."""
import json
import subprocess
import unittest
import cli as legacy
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT = legacy.ROOT
registry = legacy.registry
schemas = [json.loads((ROOT / 'sequential/report.schema.json').read_text())]
registry = registry.with_resource(schemas[0]['$id'], Resource.from_contents(schemas[0]))
for name in ['logic', 'usage', 'gates', 'values', 'scenarios', 'inventory']:
    s = json.loads((ROOT / 'sequential' / (name + '-report.schema.json')).read_text())
    Draft202012Validator.check_schema(s)
    registry = registry.with_resource(s['$id'], Resource.from_contents(s)); schemas.append(s)
validators = [Draft202012Validator(s, registry=registry) for s in schemas]


def verify(r):
    validators[-1].validate(r)
    if 'error' in r: return r
    assert all(not v.is_valid(r) for v in validators[:-1])
    a = r['analysis']
    batch = a['algorithm'] == 'rtl-scenario-sources-v1'
    validators[5 if batch else a['formatVersion'] - 1].validate(a)
    reports = [(i, x['report']) for i, x in enumerate(a['scenarios']) if 'report' in x] if batch else [(None, a)]
    assert [i for i, _ in reports] == [x['scenario'] for x in r['inventories']]
    sums = dict(inventories=len(reports), groupEntries=0, memberEntries=0, unresolvedChecks=0)
    for inv, (_, report) in zip(r['inventories'], reports):
        assert inv['snapshotId'] == report['snapshot']['snapshotId'] and inv['scope'] == report['scope']
        assert inv['inputFacts'] == len(report['registers']) and inv['inputChecks'] == len(report['checks'])
        assert inv['inputEvents'] == sum(bool(x['fact'].get('clock')) + len(x['fact']['async']) for x in report['registers'])
        assert inv['visitedEvents'] <= inv['inputEvents'] and inv['processedChecks'] <= inv['inputChecks']
        assert inv['work'] <= r['limits']['maxWork'] and len(inv['groups']) <= r['limits']['maxGroups']
        assigned = set(); sources = set(); member_count = 0
        for g in inv['groups']:
            identity = json.dumps(g['source'], sort_keys=True)
            assert identity not in sources; sources.add(identity)
            assert not assigned.intersection(g['checks']); assigned.update(g['checks'])
            assert all(i < inv['processedChecks'] for i in g['checks'])
            seen = set()
            for member in g['members']:
                ri, ci, ai = member['record'], member['check'], member['asyncIndex']
                fact = report['registers'][ri]
                assert ci in g['checks']
                assert ci == (fact['clockCheck'] if ai is None else fact['asyncChecks'][ai])
                assert member['role'] == ('clock' if ai is None else 'async')
                identity = (ri, ci, ai); assert identity not in seen; seen.add(identity)
            if not set(inv['quality']['reasons']).intersection(['budget_work', 'budget_time', 'budget_members']):
                expected = {(i, x['clockCheck'], None) for i, x in enumerate(report['registers']) if x['fact'].get('clock') and x['clockCheck'] in g['checks']}
                expected.update((i, ci, j) for i, x in enumerate(report['registers']) for j, ci in enumerate(x['asyncChecks']) if ci in g['checks'])
                assert seen == expected
            member_count += len(g['members'])
        un = [x['check'] for x in inv['unresolved']]
        assert not assigned.intersection(un) and len(set(un)) == len(un)
        assert assigned.union(un) == set(range(inv['processedChecks']))
        assert member_count <= r['limits']['maxMembers']
        if inv['quality']['completeness'] == 'complete':
            assert report['quality']['completeness'] == 'complete' and not un
            assert inv['processedChecks'] == inv['inputChecks'] and inv['visitedEvents'] == inv['inputEvents']
            assert member_count == inv['inputEvents']
        sums['groupEntries'] += len(inv['groups']); sums['memberEntries'] += member_count; sums['unresolvedChecks'] += len(un)
    assert sums == r['summary']
    assert (r['quality']['completeness'] == 'complete') == (a['quality']['completeness'] == 'complete' and all(x['quality']['completeness'] == 'complete' for x in r['inventories']))
    return r


def run(top, *args, code=0, logic=True, inventory=True):
    argv = [legacy.BIN, '--top', top, '--scope', top, '--recursive', str(legacy.FIXTURE),
            *(str(ROOT / 'tests' / (n + '.sv')) for n in ['logic', 'usage', 'gates', 'values', 'scenarios', 'inventory']),
            *(['--logic'] if logic else []), *(['--source-inventory'] if inventory else []), *args]
    p = subprocess.run(argv, capture_output=True, text=True, timeout=15)
    assert p.returncode == code, (argv, p.returncode, p.stdout, p.stderr)
    r = json.loads(p.stdout); return verify(r) if inventory else r


class Inventory(unittest.TestCase):
    def test_shared_source_and_inverted_polarity(self):
        r = run('inventory_shared', '--require-complete'); inv = r['inventories'][0]
        self.assertEqual(r['summary']['groupEntries'], 3); self.assertEqual(r['summary']['memberEntries'], 6)
        self.assertEqual(sorted(len(x['members']) for x in inv['groups']), [1, 2, 3])
        self.assertEqual(sum(x['source']['inverted'] for x in inv['groups']), 1)

    def test_clock_async_same_check_multiple_events(self):
        r = run('reused_roles', '--require-complete'); inv = r['inventories'][0]
        g = next(x for x in inv['groups'] if len(x['members']) == 2)
        self.assertEqual(len(g['checks']), 1)
        self.assertEqual({x['role'] for x in g['members']}, {'clock', 'async'})
        self.assertEqual(inv['inputEvents'], 3)

    def test_constants_group_by_value_not_physical_source(self):
        r = run('inventory_ties', '--require-complete', '--fail-on-error', code=1)
        self.assertEqual(r['summary']['groupEntries'], 1); self.assertEqual(r['summary']['memberEntries'], 4)
        self.assertEqual(r['inventories'][0]['groups'][0]['source'], dict(kind='constant', inverted=False, value='0'))
        self.assertEqual(len(r['analysis']['findings']), 4)

    def test_generated_source_keeps_both_roles_and_findings(self):
        r = run('logic_derived', '--require-complete', '--fail-on-error', code=1)
        generated = [x for x in r['inventories'][0]['groups'] if x['source']['kind'] == 'generated']
        self.assertEqual(len(generated), 1)
        self.assertEqual({x['role'] for x in generated[0]['members']}, {'clock', 'async'})
        self.assertEqual({x['rule'] for x in r['analysis']['findings']}, {'CLK-GEN', 'RST-GEN'})

    def test_unknown_and_identityless_terminal_not_grouped_by_text(self):
        for top in ['logic_procedure', 'unconnected_control']:
            with self.subTest(top=top):
                r = run(top, '--require-complete', code=4)
                self.assertGreater(r['summary']['unresolvedChecks'], 0)
                self.assertIn('unresolved_source', r['inventories'][0]['quality']['reasons'])
        r = run('undriven', '--require-complete')
        self.assertEqual(r['summary']['groupEntries'], 2)

    def test_group_limit_preserves_existing_group_and_reports(self):
        r = run('inventory_shared', '--max-inventory-groups', '1', '--require-complete', code=4)
        self.assertEqual(len(r['analysis']['checks']), 6)
        self.assertEqual(r['inventories'][0]['processedChecks'], 6)
        self.assertEqual(r['summary']['groupEntries'], 1)
        self.assertIn('budget_groups', r['inventories'][0]['quality']['reasons'])

    def test_member_limit_keeps_all_groups_and_member_prefix(self):
        r = run('inventory_shared', '--max-inventory-members', '2', '--require-complete', code=4)
        self.assertEqual(r['summary']['memberEntries'], 2); self.assertEqual(r['summary']['groupEntries'], 3)
        self.assertIn('budget_members', r['inventories'][0]['quality']['reasons'])

    def test_work_budget_stops_projection_without_false_classification(self):
        r = run('inventory_shared', '--max-inventory-work', '1', '--require-complete', code=4)
        inv = r['inventories'][0]
        self.assertEqual(inv['work'], 1); self.assertEqual(inv['processedChecks'], 0)
        self.assertEqual(inv['groups'], []); self.assertIn('budget_work', inv['quality']['reasons'])

    def test_scenario_inventories_remain_separate(self):
        r = run('gates_primary', '--scenario', 'OFF', '--input-value', 'gates_primary.en', '0', '0',
                '--scenario', 'ON', '--input-value', 'gates_primary.en', '0', '1', '--require-complete')
        self.assertEqual([x['scenario'] for x in r['inventories']], [0, 1])
        self.assertEqual(r['summary']['groupEntries'], 4)
        self.assertEqual(r['analysis']['summary']['changed'], 1)
        self.assertEqual(r['inventories'][0]['groups'][0]['source']['kind'], 'constant')
        self.assertEqual(r['inventories'][1]['groups'][0]['source']['kind'], 'primary_input')

    def test_gated_scenario_stays_partial(self):
        r = run('gates_primary', '--clock-root', 'gates_primary.clk', '0', '--scenario', 'UNKNOWN',
                '--scenario', 'ON', '--input-value', 'gates_primary.en', '0', '1', '--require-complete', code=4)
        self.assertEqual(r['analysis']['summary']['unresolved'], 1)
        self.assertEqual(r['inventories'][0]['unresolved'][0]['check'], 0)
        self.assertEqual(r['inventories'][1]['quality']['completeness'], 'complete')

    def test_structural_v1_and_usage_evidence_retained(self):
        r = run('clean', '--require-complete', logic=False)
        self.assertEqual(r['analysis']['formatVersion'], 1)
        r = run('usage_direct', '--clock-usage')
        self.assertTrue(r['analysis']['clockUsage'])
        self.assertTrue(r['analysis']['findings'])

    def test_original_partial_and_positive_members_survive(self):
        r = run('inventory_shared', '--max-checks', '2', '--require-complete', code=4)
        self.assertIn('analysis_incomplete', r['inventories'][0]['quality']['reasons'])
        self.assertIn('missing_check', r['inventories'][0]['quality']['reasons'])
        self.assertEqual(len(r['analysis']['registers']), 3)
        self.assertEqual(r['summary']['memberEntries'], 2)

    def test_invalid_limits_and_no_implicit_enable(self):
        for option in ['--max-inventory-groups', '--max-inventory-members', '--max-inventory-work', '--max-inventory-millis']:
            with self.subTest(option=option):
                self.assertEqual(run('clean', option, '0', code=2)['error']['code'], 'invalid_arguments')
                self.assertEqual(run('clean', option, '1', inventory=False, code=2)['error']['code'], 'invalid_arguments')
        self.assertEqual(run('clean', '--max-inventory-millis', '60001', code=2)['error']['code'], 'invalid_arguments')

    def test_empty_analysis_has_complete_empty_inventory(self):
        r = run('empty', '--require-complete')
        self.assertEqual(r['summary'], dict(inventories=1, groupEntries=0, memberEntries=0, unresolvedChecks=0))


if __name__ == '__main__': unittest.main()

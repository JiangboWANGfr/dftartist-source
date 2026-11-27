"""Author real RTL generation topology expectations, independent of B's frozen oracle."""
import json
import subprocess
import unittest
import inventory as inv
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT = inv.ROOT
schema = json.loads((ROOT / 'sequential/generation-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry = inv.registry.with_resource(schema['$id'], Resource.from_contents(schema))
validator = Draft202012Validator(schema, registry=registry)


def verify(r):
    validator.validate(r)
    if 'error' in r: return r
    assert all(not v.is_valid(r) for v in inv.validators)
    a = r['analysis']
    if a['algorithm'] == 'rtl-control-inventory-v1': inv.verify(a); a = a['analysis']
    else: inv.validators[5 if a['algorithm'] == 'rtl-scenario-sources-v1' else a['formatVersion'] - 1].validate(a)
    reports = [(i, x['report']) for i, x in enumerate(a['scenarios']) if 'report' in x] if a['algorithm'] == 'rtl-scenario-sources-v1' else [(None, a)]
    assert [x[0] for x in reports] == [g['scenario'] for g in r['graphs']]
    totals = dict(graphs=len(reports), nodeEntries=0, generatorEntries=0, cycleEntries=0)
    for g, (_, source) in zip(r['graphs'], reports):
        assert g['scope'] == source['scope'] and g['snapshotId'] == source['snapshot']['snapshotId']
        assert g['inputChecks'] == len(source['checks'])
        assert g['work'] <= r['limits']['maxWork'] and g['registerFacts'] <= r['limits']['maxRegisterFacts']
        assert g['registerFacts'] == sum(len(p['response']['result']['items']) for p in g['registerPages'])
        assert len(g['nodes']) <= r['limits']['maxControls'] and len(g['generators']) <= r['limits']['maxGenerators']
        assert len(g['cycles']) <= r['limits']['maxCycles']
        assert g['traceNodes'] == sum(len(n['control'].get('trace', {}).get('result', {}).get('nodes', [])) for n in g['nodes'] if 'control' in n)
        assert g['traceEdges'] == sum(len(n['control'].get('trace', {}).get('result', {}).get('edges', [])) for n in g['nodes'] if 'control' in n)
        assert g['logicWork'] == sum(n['control'].get('logic', {}).get('work', 0) for n in g['nodes'] if 'control' in n)
        for field, limit in [('traceNodes', 'maxTraceNodes'), ('traceEdges', 'maxTraceEdges'), ('logicWork', 'maxLogicWork')]: assert g[field] <= r['limits'][limit]
        assert [s['check'] for s in g['seeds']] == list(range(len(g['seeds'])))
        points = set()
        for n in g['nodes']:
            p = json.dumps(n['point'], sort_keys=True); assert p not in points; points.add(p)
            control = source['checks'][n['originalCheck']] if n['originalCheck'] is not None else n['control']
            assert control['point'] == n['point'] and control['path'] == n['path']
            if n['generator'] is not None:
                assert n['source']['kind'] == 'generated'
                assert n['source']['sourceRef'] == g['generators'][n['generator']]['fact']['ref']
        for s in g['seeds']: assert g['nodes'][s['node']]['originalCheck'] == s['check']
        refs = set()
        for generator in g['generators']:
            assert generator['fact']['ref'] not in refs; refs.add(generator['fact']['ref'])
            lookup = generator['lookup']; page = g['registerPages'][lookup['page']]
            assert page['instance'] == generator['fact']['inst']
            assert page['response']['result']['items'][lookup['item']] == generator['fact']
            assert len(generator['asyncNodes']) <= len(generator['fact']['async'])
            events = [(generator['clockNode'], generator['fact']['clock'])] + list(zip(generator['asyncNodes'], generator['fact']['async']))
            for index, event in events:
                if index is None: continue
                assert g['nodes'][index]['point']['slice'] == dict(ref=event['signal'], bits=event['bits'])
            if generator['expanded']:
                assert generator['clockNode'] is not None and len(generator['asyncNodes']) == len(generator['fact']['async'])
                assert all(n is not None for n in generator['asyncNodes'])
        for cycle in g['cycles']:
            path, controls = cycle['generators'], cycle['controls']
            assert path[0] == path[-1] and len(controls) + 1 == len(path)
            for fr, to, n in zip(path, path[1:], controls):
                parent = g['generators'][fr]
                assert n == parent['clockNode'] or n in parent['asyncNodes']
                assert g['nodes'][n]['generator'] == to
        if g['quality']['completeness'] == 'complete':
            assert len(g['seeds']) == len(source['checks']) and not g['cycles']
            assert all('source' in n and (n['source']['kind'] != 'generated' or n['generator'] is not None) for n in g['nodes'])
            assert all(x['expanded'] for x in g['generators'])
        totals['nodeEntries'] += len(g['nodes']); totals['generatorEntries'] += len(g['generators']); totals['cycleEntries'] += len(g['cycles'])
    assert totals == r['summary']
    assert (r['quality']['completeness'] == 'complete') == (r['analysis']['quality']['completeness'] == 'complete' and all(g['quality']['completeness'] == 'complete' for g in r['graphs']))
    return r


def run(top, *args, scope=None, code=0, logic=True, generation=True):
    argv = [inv.legacy.BIN, '--top', top, '--scope', scope or top, '--recursive', str(inv.legacy.FIXTURE),
            *(str(ROOT / 'tests' / (n + '.sv')) for n in ['logic', 'gates', 'values', 'generation']),
            *(['--logic'] if logic else []), *(['--control-generation'] if generation else []), *args]
    p = subprocess.run(argv, capture_output=True, text=True, timeout=15)
    assert p.returncode == code, (argv, p.returncode, p.stdout, p.stderr)
    r = json.loads(p.stdout); return verify(r) if generation else r


class Generation(unittest.TestCase):
    def test_chain_expands_outside_initial_scope(self):
        r = run('generation_chain', scope='generation_chain.u', *['--require-complete', '--fail-on-error'], code=1)
        self.assertEqual(len(r['analysis']['registers']), 1)
        self.assertEqual([g['signalPath'] for g in r['graphs'][0]['generators']], ['generation_chain.second', 'generation_chain.first'])
        self.assertEqual(r['summary']['nodeEntries'], 5)
        self.assertEqual([x['rule'] for x in r['analysis']['findings']], ['CLK-GEN'])

    def test_same_bit_shared_generator_is_expanded_once(self):
        r = run('generation_fanout', '--require-complete', scope='generation_fanout.sinks')
        self.assertEqual(r['summary']['generatorEntries'], 1)
        g = r['graphs'][0]
        self.assertEqual(sum(n['generator'] == 0 for n in g['nodes']), 2)
        self.assertEqual(len(g['registerPages']), 1)

    def test_different_written_bits_keep_distinct_register_facts(self):
        r = run('generation_shared', '--require-complete', scope='generation_shared.sinks')
        facts = [x['fact'] for x in r['graphs'][0]['generators']]
        self.assertEqual(len(facts), 2)
        self.assertEqual([x['bits']['lsb'] for x in facts], [0, 1])
        self.assertEqual(facts[0]['signal'], facts[1]['signal'])

    def test_clock_and_async_event_edges_preserve_roles(self):
        r = run('logic_derived', '--require-complete')
        g = r['graphs'][0]; self.assertEqual(len(g['generators']), 1)
        source_nodes = [n for n in g['nodes'] if n['generator'] is not None]
        self.assertGreaterEqual(len(source_nodes), 2)
        self.assertEqual({x['rule'] for x in r['analysis']['findings']}, {'CLK-GEN', 'RST-GEN'})

    def test_real_pagination_and_owner_cache(self):
        r = run('generation_paged', '--require-complete', scope='generation_paged.sinks')
        g = r['graphs'][0]
        self.assertEqual(g['registerFacts'], 70); self.assertEqual(len(g['registerPages']), 2)
        self.assertTrue(g['registerPages'][1]['cursor'])
        self.assertEqual([x['signalPath'] for x in g['generators']], ['generation_paged.r68', 'generation_paged.r69'])

    def test_scenario_context_applies_to_generator_controls_not_Q(self):
        r = run('generation_mode', '--scenario', 'DERIVED', '--input-value', 'generation_mode.sel', '0', '0',
                '--scenario', 'BYPASS', '--input-value', 'generation_mode.sel', '0', '1', '--require-complete', scope='generation_mode.u')
        self.assertEqual([len(g['generators']) for g in r['graphs']], [2, 1])
        self.assertEqual(r['analysis']['summary']['changed'], 0)
        r = run('generation_mode', '--input-value', 'generation_mode.d', '0', '0', '--input-value', 'generation_mode.sel', '0', '1',
                '--require-complete', scope='generation_mode.u')
        self.assertEqual(r['graphs'][0]['nodes'][0]['source']['kind'], 'generated')

    def test_combination_with_source_inventory_keeps_original_reports(self):
        r = run('generation_chain', '--source-inventory', '--require-complete', scope='generation_chain.u')
        self.assertEqual(r['analysis']['algorithm'], 'rtl-control-inventory-v1')
        self.assertEqual(r['analysis']['analysis']['findings'][0]['rule'], 'CLK-GEN')

    def test_self_cycle_has_closed_evidence_and_partial_policy(self):
        r = run('generation_self', '--require-complete', '--fail-on-error', code=4)
        g = r['graphs'][0]; self.assertEqual(len(g['cycles']), 1)
        self.assertEqual(g['cycles'][0]['generators'], [0, 0])
        self.assertIn('generation_cycle', g['quality']['reasons'])

    def test_two_cycles_and_cycle_output_limit(self):
        r = run('generation_cycles', '--require-complete', code=4)
        self.assertEqual(len(r['graphs'][0]['cycles']), 2)
        r = run('generation_cycles', '--max-generation-cycles', '1', '--require-complete', code=4)
        self.assertEqual(len(r['graphs'][0]['cycles']), 1)
        self.assertIn('budget_cycles', r['graphs'][0]['quality']['reasons'])

    def test_unknown_generator_clock_does_not_become_primary(self):
        r = run('generation_unknown', '--require-complete', scope='generation_unknown.u', code=4)
        g = r['graphs'][0]; self.assertEqual(len(g['generators']), 1)
        clock = g['nodes'][g['generators'][0]['clockNode']]
        self.assertNotIn('source', clock)
        self.assertIn('control_unresolved', g['quality']['reasons'])

    def test_depth_and_generator_limits_keep_proven_prefix(self):
        for option, value, reason, expected in [('--max-generation-depth', '0', 'budget_generation_depth', 0),
                                               ('--max-generation-depth', '1', 'budget_generation_depth', 1),
                                               ('--max-generation-generators', '1', 'budget_generators', 1)]:
            with self.subTest(option=option, value=value):
                r = run('generation_chain', option, value, '--require-complete', scope='generation_chain.u', code=4)
                self.assertEqual(len(r['graphs'][0]['generators']), expected)
                self.assertIn(reason, r['graphs'][0]['quality']['reasons'])
                self.assertTrue(r['analysis']['findings'])

    def test_controls_facts_work_and_trace_limits(self):
        for option, value, top, scope in [('--max-generation-controls', '1', 'generation_chain', 'generation_chain.u'),
                                         ('--max-generation-facts', '1', 'generation_paged', 'generation_paged.sinks'),
                                         ('--max-generation-work', '1', 'generation_chain', 'generation_chain.u'),
                                         ('--max-generation-trace-nodes', '1', 'generation_chain', 'generation_chain.u'),
                                         ('--max-generation-trace-edges', '0', 'generation_chain', 'generation_chain.u'),
                                         ('--max-generation-logic-work', '1', 'generation_chain', 'generation_chain.u')]:
            with self.subTest(option=option):
                r = run(top, option, value, '--require-complete', scope=scope, code=4)
                self.assertEqual(r['quality']['completeness'], 'partial')

    def test_original_partial_is_not_upgraded(self):
        r = run('generation_chain', '--max-checks', '1', '--require-complete', scope='generation_chain.u', code=4)
        self.assertIn('analysis_incomplete', r['graphs'][0]['quality']['reasons'])

    def test_primary_leaves_and_empty_design(self):
        r = run('clean', '--require-complete'); self.assertEqual(r['summary']['generatorEntries'], 0)
        r = run('empty', '--require-complete'); self.assertEqual(r['summary']['nodeEntries'], 0)

    def test_argument_requirements_and_invalid_limits(self):
        self.assertEqual(run('clean', logic=False, code=2)['error']['code'], 'invalid_arguments')
        self.assertEqual(run('clean', '--max-generation-facts', '1', generation=False, code=2)['error']['code'], 'invalid_arguments')
        for option in ['controls', 'generators', 'facts', 'work', 'cycles', 'millis', 'trace-nodes', 'logic-work']:
            with self.subTest(option=option):
                self.assertEqual(run('clean', '--max-generation-' + option, '0', code=2)['error']['code'], 'invalid_arguments')
        self.assertEqual(run('clean', '--max-generation-depth', '1001', code=2)['error']['code'], 'invalid_arguments')


if __name__ == '__main__': unittest.main()

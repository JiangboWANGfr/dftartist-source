"""Author-owned real Core scenario expectations, separate from B's oracle."""
import json
import subprocess
import unittest
import cli as legacy
from referencing import Resource
from jsonschema import Draft202012Validator

ROOT = legacy.ROOT
registry = legacy.registry
schemas = [json.loads((ROOT / 'sequential/report.schema.json').read_text())]
for name in ['logic', 'usage', 'gates', 'values', 'scenarios']:
    s = json.loads((ROOT / 'sequential' / (name + '-report.schema.json')).read_text())
    Draft202012Validator.check_schema(s)
    registry = registry.with_resource(s['$id'], Resource.from_contents(s))
    schemas.append(s)
validator = Draft202012Validator(schemas[-1], registry=registry)
old = [Draft202012Validator(s, registry=registry) for s in schemas[:-1]]


def run(top, cases, *args, code=0, logic=True, scope=None):
    argv = [legacy.BIN, '--top', top, '--scope', scope or top, '--recursive', str(legacy.FIXTURE),
            *(str(ROOT / 'tests' / (n + '.sv')) for n in ['logic', 'usage', 'gates', 'values', 'scenarios']),
            *(['--logic'] if logic else []), *args]
    for name, inputs in cases:
        argv += ['--scenario', name]
        for path, bit, value in inputs:
            argv += ['--input-value', path, str(bit), str(value)]
    p = subprocess.run(argv, capture_output=True, text=True, timeout=15)
    assert p.returncode == code, (argv, p.returncode, p.stdout, p.stderr)
    r = json.loads(p.stdout); validator.validate(r)
    if 'error' in r: return r
    assert all(not v.is_valid(r) for v in old)
    assert r['common']['scopeRequested'] == (scope or top)
    assert r['common']['recursive']
    assert len(r['scenarios']) == len(cases)
    assert [x['name'] for x in r['scenarios']] == [x[0] for x in cases]
    summary = {k: 0 for k in ['changed', 'unchanged', 'unresolved']}
    reports = [x.get('report') for x in r['scenarios']]
    for report in reports:
        if report is None: continue
        old[report['formatVersion'] - 1].validate(report)
        assert report['snapshot'] == r['snapshot']
        assert report['scope'] == r['scope']
    assert r['summary']['reportedScenarios'] == sum(x is not None for x in reports)
    assert r['summary']['notRunScenarios'] == sum(x is None for x in reports)
    for comp in r['comparisons']:
        assert comp['baseline'] == 0
        for row in comp['controls']:
            summary[row['status']] += 1
            for key, ri in [('baselineCheck', 0), ('scenarioCheck', comp['scenario'])]:
                if row[key] is not None:
                    assert reports[ri]['checks'][row[key]]['point'] == row['point']
            if row['status'] == 'changed': assert row['baselineSource'] != row['scenarioSource']
            if row['status'] == 'unchanged': assert row['baselineSource'] == row['scenarioSource']
    assert all(r['summary'][k] == v for k, v in summary.items())
    assert sum(summary.values()) <= r['limits']['maxComparisons']
    if r['quality']['completeness'] == 'complete':
        assert all(x['quality']['completeness'] == 'complete' for x in reports)
        assert not summary['unresolved']
    return r


def values(top, input='sel'):
    return [('功能', [(top + '.' + input, 0, 0)]), ('扫描 mode', [(top + '.' + input, 0, 1)])]


def clock_rows(r, suffix='.u'):
    reports = [x['report'] for x in r['scenarios']]
    rec = next(x for x in reports[0]['registers'] if x['instancePath'].endswith(suffix))
    return next(x for x in r['comparisons'][0]['controls'] if x['baselineCheck'] == rec['clockCheck'])


class Scenarios(unittest.TestCase):
    def test_bypass_source_changed_and_original_errors_retained(self):
        r = run('logic_bypass', values('logic_bypass'), '--require-complete', '--fail-on-error', code=1)
        self.assertEqual(r['summary'], dict(reportedScenarios=2, notRunScenarios=0, changed=1, unchanged=2, unresolved=0))
        row = clock_rows(r)
        self.assertEqual([row[k]['kind'] for k in ['baselineSource', 'scenarioSource']], ['generated', 'primary_input'])
        self.assertEqual([x['rule'] for x in r['scenarios'][0]['report']['findings']], ['CLK-GEN'])
        self.assertEqual(r['scenarios'][1]['report']['findings'], [])
        self.assertEqual(run('logic_bypass', values('logic_bypass'))['quality']['completeness'], 'complete')

    def test_gate_off_constant_to_primary(self):
        r = run('gates_primary', values('gates_primary', 'en'), '--require-complete')
        row = clock_rows(r)
        self.assertEqual(row['baselineSource']['value'], '0')
        self.assertEqual(row['scenarioSource']['kind'], 'primary_input')
        self.assertEqual(r['summary']['changed'], 1)

    def test_direct_v2_and_conditional_v5_normalize_same_source(self):
        r = run('values_clock', [('unconditional', []), ('unrelated', [('values_clock.d', 0, 0)])], '--require-complete')
        self.assertEqual(r['summary']['unchanged'], 1)
        self.assertEqual([x['report']['formatVersion'] for x in r['scenarios']], [2, 5])

    def test_constant_and_undriven_structural_terminals(self):
        for top in ['constant_control', 'undriven']:
            with self.subTest(top=top):
                r = run(top, [('base', []), ('value', [(top + '.d', 0, 0)])], '--require-complete')
                self.assertEqual(r['summary']['changed'], 0)
                self.assertEqual(r['summary']['unresolved'], 0)
                self.assertGreater(r['summary']['unchanged'], 0)
                self.assertTrue(r['scenarios'][0]['report']['findings'])

    def test_unconnected_without_point_identity_stays_unresolved(self):
        r = run('unconnected_control', [('base', []), ('value', [('unconnected_control.d', 0, 0)])],
                '--require-complete', code=4)
        row = clock_rows(r)
        self.assertEqual(row['status'], 'unresolved')
        self.assertEqual(row['reasons'], ['baseline_unresolved', 'scenario_unresolved'])
        self.assertTrue(all(x['report']['quality']['completeness'] == 'complete' for x in r['scenarios']))
        self.assertTrue(all(x['report']['findings'][0]['rule'] == 'CLK-UNCTRL' for x in r['scenarios']))

    def test_polarity_changes_identity_not_just_ref(self):
        row = clock_rows(run('scenario_polarity', values('scenario_polarity'), '--require-complete'))
        self.assertEqual(row['status'], 'changed')
        self.assertEqual(row['baselineSource']['sourceRef'], row['scenarioSource']['sourceRef'])
        self.assertFalse(row['baselineSource']['inverted']); self.assertTrue(row['scenarioSource']['inverted'])

    def test_double_inversion_parity(self):
        r = run('scenario_parity', values('scenario_parity'), '--require-complete')
        self.assertEqual(r['summary']['changed'], 0)
        self.assertEqual(clock_rows(r)['status'], 'unchanged')

    def test_flat_bus_bit_difference(self):
        row = clock_rows(run('scenario_bus', values('scenario_bus'), '--require-complete'))
        self.assertEqual(row['status'], 'changed')
        self.assertEqual([row[k]['point']['slice']['bits']['lsb'] for k in ['baselineSource', 'scenarioSource']], [1, 3])

    def test_shared_body_instances_keep_identity(self):
        r = run('scenario_shared', values('scenario_shared'), '--require-complete')
        self.assertEqual(r['summary']['changed'], 1)
        self.assertEqual(clock_rows(r, '.a.u')['status'], 'changed')
        self.assertEqual(clock_rows(r, '.b.u')['status'], 'unchanged')

    def test_fourstate_constant_not_boolean_equivalence(self):
        row = clock_rows(run('scenario_fourstate', values('scenario_fourstate'), '--require-complete'))
        self.assertEqual(row['status'], 'changed')
        self.assertEqual([row[k]['value'] for k in ['baselineSource', 'scenarioSource']], ['x', 'z'])

    def test_gated_unresolved_does_not_claim_fixed(self):
        r = run('gates_primary', [('unknown gate', []), ('enabled', [('gates_primary.en', 0, 1)])],
                '--clock-root', 'gates_primary.clk', '0', '--require-complete', '--fail-on-error', code=4)
        row = clock_rows(r)
        self.assertEqual(row['status'], 'unresolved'); self.assertEqual(row['reasons'], ['baseline_unresolved'])
        self.assertNotIn('baselineSource', row)
        self.assertEqual([x['report']['formatVersion'] for x in r['scenarios']], [4, 5])

    def test_unsupported_process_is_unresolved(self):
        r = run('logic_procedure', [('A', []), ('B', [])], '--require-complete', code=4)
        self.assertEqual(clock_rows(r)['status'], 'unresolved')
        self.assertEqual(r['summary']['changed'], 0)

    def test_partial_retains_positive_changes(self):
        r = run('logic_bypass', values('logic_bypass'), '--max-checks', '2', '--require-complete', code=4)
        self.assertEqual(r['quality']['completeness'], 'partial')
        self.assertEqual(r['summary']['changed'], 1)
        self.assertTrue(all(x['report']['registers'] for x in r['scenarios']))

    def test_comparison_cap_and_multiple_cases_keep_all_reports(self):
        cases = values('logic_bypass') + [('third', [('logic_bypass.sel', 0, 0)])]
        r = run('logic_bypass', cases, '--max-comparisons', '1', '--require-complete', code=4)
        self.assertEqual(sum(r['summary'][k] for k in ['changed', 'unchanged', 'unresolved']), 1)
        self.assertEqual(r['summary']['reportedScenarios'], 3)
        self.assertIn('budget_comparisons', r['quality']['reasons'])
        self.assertEqual([x['scenario'] for x in r['comparisons']], [1, 2])

    def test_usage_nested_v3_and_values_v5(self):
        r = run('values_clock', [('base', []), ('unused', [('values_clock.d', 0, 0)])], '--clock-usage')
        self.assertEqual([x['report']['formatVersion'] for x in r['scenarios']], [3, 5])
        self.assertEqual(r['summary']['changed'], 0)
        self.assertTrue(all('clockUsage' in x['report'] for x in r['scenarios']))

    def test_names_and_scenario_shape(self):
        for cases in [[('', []), ('B', [])], [('A', []), ('A', [])], [('A', [])],
                      [('X' * 129, []), ('B', [])], [('中' * 43, []), ('B', [])],
                      [(str(i), []) for i in range(9)]]:
            with self.subTest(cases=cases):
                self.assertEqual(run('values_clock', cases, code=2)['error']['code'], 'invalid_arguments')
        r = run('values_clock', [(str(i), []) for i in range(8)], '--require-complete')
        self.assertEqual(r['summary']['reportedScenarios'], 8)

    def test_bad_common_and_no_implicit_global_inputs(self):
        for args in [('--max-millis', '0'), ('--max-scenario-millis', '0'), ('--max-comparisons', '0'),
                     ('--input-value', 'values_clock.d', '0', '0')]:
            with self.subTest(args=args):
                self.assertEqual(run('values_clock', [('A', []), ('B', [])], *args, code=2)['error']['code'], 'invalid_arguments')
        self.assertEqual(run('values_clock', [('A', []), ('B', [])], logic=False, code=2)['error']['code'], 'invalid_arguments')
        for flag in ['--max-scenario-millis', '--max-comparisons']:
            self.assertEqual(run('values_clock', [], flag, '1', code=2)['error']['code'], 'invalid_arguments')

    def test_second_case_error_publishes_only_error(self):
        for inputs, code in [([('values_clock.clk', 4, 0)], 2), ([('no_such_input', 0, 0)], 3),
                             ([('values_clock.d', 0, 0), ('values_clock.d', 0, 0)], 2)]:
            r = run('values_clock', [('ok', []), ('broken', inputs)], code=code)
            self.assertEqual(list(r), ['error']); self.assertIn('broken', r['error']['message'])
        self.assertEqual(run('values_clock', [('A', []), ('B', [])], scope='absent', code=3)['error']['code'], 'not_found')

    def test_common_options_remain_common_after_case_delimiters(self):
        argv = [legacy.BIN, '--top', 'gates_primary', str(legacy.FIXTURE), str(ROOT / 'tests/gates.sv'),
                '--scenario', 'base', '--input-value', 'gates_primary.en', '0', '0',
                '--scenario', 'enabled', '--input-value', 'gates_primary.en', '0', '1',
                '--logic', '--scope', 'gates_primary', '--recursive', '--max-checks', '10',
                '--clock-root', 'gates_primary.clk', '0', '--require-complete']
        p = subprocess.run(argv, capture_output=True, text=True, timeout=15)
        self.assertEqual(p.returncode, 0, p.stdout)
        r = json.loads(p.stdout); validator.validate(r)
        self.assertTrue(all(x['report']['limits']['maxChecks'] == 10 and x['report']['clockRoots'] for x in r['scenarios']))
        self.assertEqual(r['summary']['changed'], 1)

    def test_depth_budget_never_becomes_definite_change(self):
        r = run('logic_bypass', values('logic_bypass'), '--max-logic-work', '1', '--require-complete', code=4)
        self.assertEqual(r['summary']['changed'], 0)
        self.assertGreater(r['summary']['unresolved'], 0)


if __name__ == '__main__': unittest.main()
